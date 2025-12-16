
import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import { JobListing, UserProfile, ChatMessage } from "../types";

// Instantiating the client. Ensure the key has permissions for the "flash-native-audio" models, 
// otherwise the Live API connection will hang or fail silently.
const apiKey = process.env.API_KEY || ""; 
const ai = new GoogleGenAI({ apiKey });

interface Blob {
  data: string;
  mimeType: string;
}

/**
 * Analyzes the fit between a candidate and a job description.
 * We rely on Gemini's multimodal capabilities to digest raw PDFs without needing a separate OCR step.
 */
export const analyzeApplicationMatch = async (user: UserProfile, job: JobListing): Promise<{ score: number; analysis: string }> => {
  // Using a "Persona" prompt here enforces a stricter evaluation standard. 
  // Without this, the model tends to be too agreeable/optimistic about matches.
  let promptText = `
    Act as a strict senior technical recruiter. Evaluate the following candidate for the job role.
    
    Job Title: ${job.title}
    Job Description: ${job.description}
    Requirements: ${job.requirements.join(', ')}

    Candidate Profile Data:
    Name: ${user.name}
    Title: ${user.title}
    Summary: ${user.summary}
    Skills: ${user.skills.map(s => `${s.name} (${s.level})`).join(', ')}
    Experience: ${user.experience.map(e => `${e.role} at ${e.company} (${e.duration}): ${e.description}`).join(', ')}
    Education: ${user.education.map(e => `${e.degree} at ${e.institution}`).join(', ')}

    Task:
    1. Compare the candidate's skills, experience, and uploaded CV (if provided) against the job requirements.
    2. Assign a match score from 0 to 100.
    3. Provide a concise analysis (max 50 words).

    Output JSON: { score: number, analysis: string }
  `;

  const parts: any[] = [{ text: promptText }];
  
  // If they have a PDF, shove the base64 straight into the prompt. 
  // Gemini 2.5 handles this surprisingly well.
  if (user.resume && user.resume.startsWith('data:application/pdf')) {
    const base64Data = user.resume.split(',')[1];
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: base64Data
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            analysis: { type: Type.STRING }
          }
        }
      }
    });

    // Defensive parsing. Even with JSON mode, I've seen it occasionally return md-wrapped blocks.
    const result = JSON.parse(response.text || "{}");
    return {
      score: result.score || 0,
      analysis: result.analysis || "Analysis unavailable."
    };
  } catch (error) {
    console.error("Match Analysis Error:", error);
    return { score: 0, analysis: "Error during evaluation." };
  }
};

/**
 * Generates the next conversational turn for the "Warren" AI Recruiter persona.
 * Used for the Text Chat fallback mode when WebRTC isn't an option.
 */
export const generateChatInterviewQuestion = async (
  history: ChatMessage[], 
  job: JobListing, 
  user: UserProfile
): Promise<string> => {
  const isFirstMessage = history.length === 0;

  let promptText = `
    You are "Warren", a professional AI Recruiter for ${job.company}. 
    Interviewing: ${user.name} for ${job.title}.
    
    Context:
    - Candidate Skills: ${user.skills.map(s => s.name).join(', ')}
    - Job Requirements: ${job.requirements.join(', ')}
    
    History:
    ${history.map(h => `${h.role}: ${h.text}`).join('\n')}
    
    Task:
    ${isFirstMessage 
      ? `Introduce yourself, break the ice, and ask: "Tell me about yourself and your interest in this role?"` 
      : `Ask the next relevant technical or behavioral question based on the candidate's last response. If 4-5 questions have been asked, say "END_INTERVIEW".`}
  `;

  const parts: any[] = [{ text: promptText }];
  if (user.resume && user.resume.startsWith('data:application/pdf')) {
     const base64Data = user.resume.split(',')[1];
     parts.push({ inlineData: { mimeType: 'application/pdf', data: base64Data }});
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: { parts },
  });

  return response.text || "Hello, I am Warren.";
};

/**
 * Standard text-generation task. 
 * We keep this brief to avoid overwhelming the user with a novel.
 */
export const generateInterviewFeedback = async (transcript: ChatMessage[], job: JobListing): Promise<string> => {
  const context = `
    Act as Warren (AI Recruiter). Write a short, encouraging email to the candidate after their interview for ${job.title}.
    Transcript: ${transcript.map(m => `${m.role}: ${m.text}`).join('\n')}
    Constraint: Under 100 words. Mention next steps (human review).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: context,
  });

  return response.text || "Thank you. We will be in touch.";
};

export const generateRecruiterSummary = async (transcript: ChatMessage[], job: JobListing, user: UserProfile): Promise<string> => {
  const context = `
    Summarize this interview for the Hiring Manager.
    Candidate: ${user.name}, Role: ${job.title}.
    Transcript: ${transcript.map(m => `${m.role}: ${m.text}`).join('\n')}
    
    Required Output:
    1. Key Strengths
    2. Red Flags (if any)
    3. Recommendation (Hire/No Hire)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: context,
  });

  return response.text || "Summary generation failed.";
};

/**
 * Uses Google Search grounding. 
 * Handy for pulling real-time company news so the candidate isn't applying into a void.
 */
export const researchCompany = async (companyName: string): Promise<{text: string, links: any[]}> => {
  const prompt = `Summary of "${companyName}" (news, culture, products) for a job applicant.`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    return { 
      text: response.text || "No data found.", 
      links: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
  } catch (error) {
    return { text: "Research failed.", links: [] };
  }
};

/**
 * Manages the WebSocket-based Live API session.
 * This is the tricky part: keeping AudioContext states in sync with the raw PCM stream from Gemini.
 * Any hiccup in buffer management results in audio artifacts.
 */
export class LiveInterviewSession {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private active = false;
  
  public onMessage: (text: string, isUser: boolean) => void = () => {};
  public onStatusChange: (status: string) => void = () => {};

  constructor(
    private job: JobListing, 
    private user: UserProfile, 
    private videoMode: boolean,
    private playbackContext: AudioContext,
    private recordingMixer: MediaStreamAudioDestinationNode,
    private inputStream: MediaStream
  ) {}

  async connect() {
    this.active = true;
    this.onStatusChange("Connecting to Warren...");
    
    // We force 16kHz here for the INPUT stream because the Gemini model expects this specific sample rate.
    // The OUTPUT (playback) context usually runs at 24kHz or 48kHz depending on the OS/Browser.
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

    const systemInstruction = `
      You are "Warren", an AI recruiter for ${this.job.company}.
      Conducting a ${this.videoMode ? 'video' : 'voice'} interview with ${this.user.name} for ${this.job.title}.
      
      Protocol:
      1. SPEAK FIRST. Introduce yourself.
      2. Check AV quality ("Can you hear me?").
      3. Ask probing questions based on their experience.
      4. Maintain a professional yet conversational tone.
    `;

    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          this.onStatusChange("Connected. Warren is listening...");
          this.startAudioInputStream();
          // Kickstart the model conversation so the user isn't staring at a blank screen.
          this.sessionPromise?.then(session => {
            session.sendRealtimeInput({ text: "System: Session started. Introduce yourself." });
          });
        },
        onmessage: async (msg: LiveServerMessage) => this.handleServerMessage(msg),
        onclose: () => this.onStatusChange("Session Ended."),
        onerror: (err) => {
          console.error("Gemini Live Error:", err);
          this.onStatusChange("Connection Error.");
        }
      },
      config: {
        systemInstruction: systemInstruction,
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });

    await this.sessionPromise;
  }

  private async startAudioInputStream() {
    if (!this.inputAudioContext || !this.inputStream) return;
    
    try {
      const source = this.inputAudioContext.createMediaStreamSource(this.inputStream);
      // Using a ScriptProcessor is deprecated but sadly still the most reliable way 
      // to get raw PCM data across all browsers without setting up AudioWorklets.
      const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (e) => {
        if (!this.active) return;
        
        // Grab the channel data and downsample/convert to the format Gemini expects (PCM 16kHz)
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = this.createBlob(inputData);
        
        this.sessionPromise?.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(this.inputAudioContext.destination);
    } catch (err) {
      console.error("Stream setup failed - check mic permissions?", err);
    }
  }

  private async handleServerMessage(message: LiveServerMessage) {
    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    
    if (audioData && this.playbackContext) {
      // Buffer management: Schedule the next chunk to play exactly when the current one finishes.
      // If we drift, the audio sounds choppy.
      this.nextStartTime = Math.max(this.nextStartTime, this.playbackContext.currentTime);
      
      const audioBuffer = await this.decodeAudioData(
        this.base64ToBytes(audioData), 
        this.playbackContext
      );
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Split output: 
      // 1. To the user's speakers (so they can hear Warren)
      // 2. To the recording mixer (so we can save the interview)
      source.connect(this.playbackContext.destination);
      source.connect(this.recordingMixer);
      
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);
      
      source.onended = () => this.sources.delete(source);
    }

    if (message.serverContent?.interrupted) {
      // User interrupted the model? Kill pending buffers immediately.
      this.sources.forEach(s => s.stop());
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  public disconnect() {
    this.active = false;
    this.inputAudioContext?.close();
    this.sessionPromise = null;
  }

  // --- Low-level PCM Utils ---
  // The API deals in raw bytes, not friendly file formats like MP3.

  private createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Simple float-to-int16 conversion
      int16[i] = data[i] * 32768;
    }
    return {
      data: this.bytesToBase64(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    // Output sample rate here should match the playback context (usually 24k or 48k)
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  }
}
