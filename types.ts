
export enum UserRole {
  CANDIDATE = 'CANDIDATE',
  RECRUITER = 'RECRUITER'
}

export interface Skill {
  name: string;
  level: 'Beginner' | 'Intermediate' | 'Expert';
}

export interface Education {
  degree: string;
  institution: string;
  year: number;
}

export interface Experience {
  role: string;
  company: string;
  duration: string;
  description: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  phone?: string;
  address?: string;
  verified?: boolean;
  
  // Profile
  title: string;
  summary: string;
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  
  // Attachments (Base64)
  avatar?: string;
  resume?: string;
  resumeName?: string;

  // Recruiter Fields
  company?: string;
  website?: string;
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Contract' | 'Freelance' | 'Internship' | 'Learnership';
  salaryRange: string;
  description: string;
  requirements: string[];
  postedBy: string;
  postedDate: string;
  questions: string[];
  interviewSetting: 'OPEN' | 'CHAT' | 'VOICE' | 'VIDEO';
}

export enum ApplicationStatus {
  APPLIED = 'Applied',
  AI_SCREENING = 'AI Screening',
  INTERVIEW_PENDING = 'Interview Pending',
  INTERVIEW_COMPLETED = 'Interview Completed',
  FINAL_INVITE_SENT = 'Final Invite Sent',
  OFFER = 'Offer',
  REJECTED = 'Rejected'
}

export enum InterviewMode {
  CHAT = 'Chat',
  VOICE = 'Voice',
  VIDEO = 'Video'
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
}

export interface Application {
  id: string;
  jobId: string;
  userId: string;
  status: ApplicationStatus;
  matchScore: number;
  aiAnalysis?: string;
  interviewSummary?: string;
  interviewMode?: InterviewMode;
  transcript?: ChatMessage[];
  recordingData?: string; 
  recordingType?: 'audio/webm' | 'video/webm';
  finalRecruiterFeedback?: string;
  appliedDate: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  date: string;
}

export interface Message {
  _id?: string;
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  subject: string;
  content: string;
  read: boolean;
  date: string;
  isAi?: boolean;
}
