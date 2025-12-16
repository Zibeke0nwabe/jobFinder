
import React, { useState, useEffect, useRef } from 'react';
import { JobListing, UserProfile, InterviewMode, ChatMessage } from '../types';
import { generateChatInterviewQuestion, LiveInterviewSession } from '../services/gemini';

interface InterviewModalProps {
  job: JobListing;
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (transcript: ChatMessage[], recordingData?: string, recordingType?: 'audio/webm' | 'video/webm') => void;
}

const InterviewModal: React.FC<InterviewModalProps> = ({ job, user, isOpen, onClose, onComplete }) => {
  // UI State
  const [mode, setMode] = useState<InterviewMode | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  
  // Media Refs - Keep track of these to kill streams on unmount
  const liveSessionRef = useRef<LiveInterviewSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Audio Graph Refs
  // We need a custom mixer node because we want to record the AI + User, 
  // but NOT pipe the User's voice back to their own speakers (echo).
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingMixerRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle "Forced" interview modes (e.g., Recruiter mandates Video only)
  useEffect(() => {
    if (isOpen && !hasStarted && job.interviewSetting && job.interviewSetting !== 'OPEN') {
       const map = { 'CHAT': InterviewMode.CHAT, 'VOICE': InterviewMode.VOICE, 'VIDEO': InterviewMode.VIDEO };
       const forcedMode = map[job.interviewSetting as keyof typeof map];
       if (forcedMode) startInterview(forcedMode);
    }
  }, [isOpen, job.interviewSetting, hasStarted]);

  // Clean up streams when the component unmounts to prevent the "camera still on" light from staying active.
  useEffect(() => {
    return () => cleanupMedia();
  }, []);

  const cleanupMedia = () => {
    liveSessionRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(track => track.stop());
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  const startInterview = async (selectedMode: InterviewMode) => {
    setMode(selectedMode);
    setHasStarted(true);
    
    if (selectedMode === InterviewMode.CHAT) {
      setLoading(true);
      const question = await generateChatInterviewQuestion([], job, user);
      setMessages([{ role: 'model', text: question, timestamp: new Date() }]);
      setLoading(false);
      return;
    } 
    
    // Voice/Video Setup
    const isVideo = selectedMode === InterviewMode.VIDEO;
    setStatus("Requesting Device Permissions...");
    
    try {
      // Create the AudioContext first. Browsers enforce user gesture restrictions, 
      // but since this is called from an onClick, we should be safe.
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      const mixer = ctx.createMediaStreamDestination(); // This is where we dump audio for the MediaRecorder
      recordingMixerRef.current = mixer;

      // Request raw streams. 
      // NOTE: Failure here usually means user denied permission or OS level privacy block.
      const userStream = await navigator.mediaDevices.getUserMedia({ 
        video: isVideo, 
        audio: true 
      });
      streamRef.current = userStream;

      // Hook up the local video preview
      if (isVideo && videoRef.current) {
        videoRef.current.srcObject = userStream;
        videoRef.current.play().catch(e => console.warn("Autoplay blocked by browser policy", e));
      }

      // Route Mic -> Mixer 
      // IMPORTANT: We do NOT connect this to ctx.destination, otherwise the user hears themselves.
      const micSource = ctx.createMediaStreamSource(userStream);
      micSource.connect(mixer); 

      // Setup the MediaRecorder
      // If Video is active, we need to merge the Camera Track with the Mixed Audio Track (Mic + AI Voice)
      let recorderStream = mixer.stream;
      if (isVideo) {
        const videoTrack = userStream.getVideoTracks()[0];
        const audioTrack = mixer.stream.getAudioTracks()[0];
        if (videoTrack && audioTrack) {
          recorderStream = new MediaStream([videoTrack, audioTrack]);
        }
      }

      const recorder = new MediaRecorder(recorderStream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start();

      // Handshake with Gemini Live API
      setStatus("Connecting to Warren...");
      const session = new LiveInterviewSession(job, user, isVideo, ctx, mixer, userStream);
      session.onStatusChange = setStatus;
      liveSessionRef.current = session;
      
      // Add a timeout race condition because sometimes the socket just hangs
      await Promise.race([
        session.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timed out - Check Network")), 15000))
      ]);

    } catch (e: any) {
       console.error("Device Setup Failed:", e);
       setStatus(`Error: ${e.message}`);
       setTimeout(() => { alert("Failed to initialize media devices. Please check permissions."); onClose(); }, 1000);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // Optimistic UI update
    const newHistory = [...messages, { role: 'user', text: inputText, timestamp: new Date() } as ChatMessage];
    setMessages(newHistory);
    setInputText('');
    setLoading(true);

    const response = await generateChatInterviewQuestion(newHistory, job, user);
    
    // Check for the "Kill Switch" token from the AI
    if (response.includes("END_INTERVIEW")) {
       finishInterview(newHistory);
    } else {
       setMessages([...newHistory, { role: 'model', text: response, timestamp: new Date() }]);
    }
    setLoading(false);
  };

  const finishInterview = async (finalTranscript?: ChatMessage[]) => {
    liveSessionRef.current?.disconnect();

    // Ensure we capture the final bits of the recording buffer
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => processRecording(finalTranscript);
      mediaRecorderRef.current.stop();
    } else {
      processRecording(finalTranscript);
    }
  };

  const processRecording = (finalTranscript?: ChatMessage[]) => {
    cleanupMedia();

    let transcript = finalTranscript || messages;
    let base64 = undefined;
    let type: 'audio/webm' | 'video/webm' | undefined = undefined;

    // Convert the recorded chunks into a single Blob
    if ((mode === InterviewMode.VOICE || mode === InterviewMode.VIDEO) && recordedChunksRef.current.length > 0) {
       const blobType = mode === InterviewMode.VIDEO ? 'video/webm' : 'audio/webm';
       const blob = new Blob(recordedChunksRef.current, { type: blobType });
       
       const reader = new FileReader();
       reader.readAsDataURL(blob);
       reader.onloadend = () => {
          base64 = reader.result as string;
          type = blobType;
          
          transcript = [
             { role: 'system', text: `*** ${mode} SESSION RECORDED ***`, timestamp: new Date() },
             { role: 'model', text: "Interview submitted.", timestamp: new Date() }
          ];
          onComplete(transcript, base64, type);
       };
    } else {
       onComplete(transcript);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative border border-primary/20">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white z-10">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-black text-primary rounded-lg flex items-center justify-center font-bold">W</div>
             <div>
               <h2 className="text-lg font-bold text-gray-800">Warren <span className="text-gray-400 font-normal">| AI Recruiter</span></h2>
               <p className="text-xs text-gray-500">Interviewing for <span className="font-semibold">{job.title}</span></p>
             </div>
          </div>
          <button onClick={() => hasStarted ? finishInterview() : onClose()} className="text-gray-400 hover:text-red-500 px-3 py-1 bg-gray-100 rounded-lg text-sm font-bold">
            Exit
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-900">
          
          {!mode && (
            <div className="flex flex-col items-center justify-center h-full space-y-8 p-8 animate-fade-in bg-gray-50">
              <div className="text-center max-w-md">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">Select Interview Mode</h3>
                <p className="text-gray-600">Warren is ready. Choose how you'd like to proceed.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
                {[
                  { id: InterviewMode.CHAT, label: 'Text Chat', desc: 'Message based', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z', color: 'blue' },
                  { id: InterviewMode.VOICE, label: 'Voice Call', desc: 'Audio only', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', color: 'purple' },
                  { id: InterviewMode.VIDEO, label: 'Video Interview', desc: 'Face-to-face', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', color: 'green' }
                ].map(opt => (
                  <button key={opt.id} onClick={() => startInterview(opt.id)} className="group p-6 bg-white rounded-2xl border border-gray-200 hover:border-primary shadow-lg hover:shadow-xl transition flex flex-col items-center text-center">
                    <div className={`w-16 h-16 bg-${opt.color}-50 rounded-full flex items-center justify-center mb-4 text-${opt.color}-600 group-hover:scale-110 transition`}>
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} /></svg>
                    </div>
                    <h4 className="font-bold text-gray-800 text-lg">{opt.label}</h4>
                    <p className="text-xs text-gray-500 mt-2">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === InterviewMode.CHAT && (
            <div className="flex flex-col h-full bg-gray-50">
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'model' && <div className="w-8 h-8 bg-black text-primary rounded-full flex items-center justify-center font-bold text-xs mr-3 mt-1">W</div>}
                    <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-[#2b1c55] text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                   <div className="flex ml-11 gap-2"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div></div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-6 bg-white border-t border-gray-200">
                <form onSubmit={handleChatSubmit} className="flex gap-4">
                  <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type your response..." className="flex-1 px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-gray-800" />
                  <button type="submit" className="bg-[#2b1c55] text-white px-8 py-4 rounded-xl font-bold shadow-lg">Send</button>
                </form>
              </div>
            </div>
          )}

          {(mode === InterviewMode.VOICE || mode === InterviewMode.VIDEO) && (
            <div className="flex flex-col h-full relative bg-[#1f1f1f]">
              <div className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-red-600/20 px-3 py-1 rounded-full border border-red-500/50">
                 <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                 <span className="text-xs font-bold text-white">REC</span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center relative p-8">
                  <div className={`w-40 h-40 md:w-56 md:h-56 rounded-full flex items-center justify-center border-4 ${status.includes('Listening') || status.includes('Warren') ? 'border-primary animate-pulse' : 'border-gray-600'} bg-black relative z-10`}>
                      <span className="text-6xl md:text-8xl">👔</span>
                  </div>
                  <h3 className="text-white font-bold text-2xl mt-6">Warren</h3>
                  <div className="bg-black/40 px-6 py-3 rounded-full backdrop-blur-md border border-white/10 text-white font-medium text-sm mt-4">
                      {status || 'Connecting...'}
                  </div>
              </div>

              {mode === InterviewMode.VIDEO && (
                <div className="absolute bottom-24 right-6 w-48 h-36 bg-black rounded-xl border border-gray-700 shadow-2xl overflow-hidden z-20">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                  <div className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">You</div>
                </div>
              )}

              <div className="h-20 bg-[#121212] flex items-center justify-center gap-6 border-t border-gray-800">
                  <button onClick={() => finishInterview()} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2">
                    End Call
                  </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterviewModal;
