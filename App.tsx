
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, JobListing, UserRole, Application, ApplicationStatus, InterviewMode, ChatMessage, Notification, Message, Experience, Education, Skill } from './types';
import { analyzeApplicationMatch, generateInterviewFeedback, researchCompany, generateRecruiterSummary } from './services/gemini';
import InterviewModal from './components/InterviewModal';

// Production/Dev toggle. If we're on Render, we need the real backend URL. 
// Localhost falls back to port 5000 for local dev speed.
// Using 127.0.0.1 instead of 'localhost' prevents Node v17+ from trying IPv6 (::1) 
// when the server is listening on IPv4.
const API_URL = process.env.API_URL || 'http://127.0.0.1:5000/api';

const AUTH_URL = `${API_URL}/auth`;
const TECH_ERROR_MSG = "Our Tech Team are currently working on the system. We are aware of the error. Please try again later after 1-2 hours.";

// Initial Form States (Functions to ensure fresh objects every time)
const getInitialRegForm = () => ({ 
  role: UserRole.CANDIDATE, name: '', email: '', password: '', phone: '', address: '', 
  title: '', summary: '', company: '', website: '',
  experience: [], education: [], skills: []
});

const getInitialJobForm = () => ({ 
  title: '', company: '', location: '', type: 'Full-time', salary: '', desc: '', reqs: '', questions: '', 
  interviewSetting: 'OPEN'
});

type IconProps = React.SVGProps<SVGSVGElement>;

// UI Icons
const Icons = {
  Dashboard: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  SearchJob: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Applications: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
  Message: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  Stats: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>,
  News: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>,
  Filter: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
  Bell: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  List: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  Grid: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  Plus: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
  Menu: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  User: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  Upload: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Check: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>,
  X: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>,
  Info: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Alert: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  Send: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
  Play: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Star: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  Practice: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  Refresh: (props: IconProps) => <svg {...props} className={`w-6 h-6 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  CloudOff: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>,
  ArrowLeft: (props: IconProps) => <svg {...props} className={`w-5 h-5 ${props.className || ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
};

const getScoreColor = (score: number) => {
  if (score >= 75) return 'text-green-600 bg-green-100 border-green-200';
  if (score >= 50) return 'text-amber-600 bg-amber-100 border-amber-200';
  return 'text-red-600 bg-red-100 border-red-200';
};

const App: React.FC = () => {
  // State management is getting a bit heavy here. 
  // TODO: Refactor this into a Context Provider or Redux store if we add more features.
  
  // Application Data
  const [users, setUsers] = useState<UserProfile[]>([]); 
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // Navigation & User Session
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('search_job');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [recruiterFilterMode, setRecruiterFilterMode] = useState<'NEW' | 'PENDING' | 'INVITED' | 'REJECTED'>('NEW');

  // Search Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterType, setFilterType] = useState<string | null>(null);

  // Authentication State
  const [regStep, setRegStep] = useState(1);
  const [enteredOTP, setEnteredOTP] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Job Application State
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<JobListing | null>(null); // Used for viewing details in full page
  const [showApplyModal, setShowApplyModal] = useState(false);
  
  // AI Research
  const [researchResult, setResearchResult] = useState<{text: string, links: any[]} | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [showResearch, setShowResearch] = useState(false);

  // Interviews & Reviews
  const [interviewJob, setInterviewJob] = useState<JobListing | null>(null);
  const [isInterviewOpen, setIsInterviewOpen] = useState(false);
  const [reviewApp, setReviewApp] = useState<Application | null>(null);

  // Practice Mode
  const [isPractice, setIsPractice] = useState(false);
  const [practiceJD, setPracticeJD] = useState('');
  const [showPracticeResults, setShowPracticeResults] = useState(false);
  const [practiceFeedback, setPracticeFeedback] = useState<{candidate: string, recruiter: string} | null>(null);

  // Messaging & Invites
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ type: 'Virtual', date: '', time: '', location: '' });
  const [replyText, setReplyText] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState({ toId: '', subject: '', content: '' });

  // Profile Management
  const [profileForm, setProfileForm] = useState<{
     name: string; title: string; phone: string; address: string; summary: string; skills: string;
  }>({ name: '', title: '', phone: '', address: '', summary: '', skills: '' });
  const [isProfileSaving, setIsProfileSaving] = useState(false);

  // System States
  const [alertState, setAlertState] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', message: '', type: 'info' });
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isServerError, setIsServerError] = useState(false);

  // Data Entry Forms
  const [regForm, setRegForm] = useState<Partial<UserProfile> & { password?: string }>(getInitialRegForm());
  const [jobForm, setJobForm] = useState(getInitialJobForm());

  useEffect(() => {
    const savedSession = localStorage.getItem('jf_session');
    if (savedSession) setCurrentUser(JSON.parse(savedSession));
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (currentUser && activeTab === 'profile') {
        setProfileForm({
            name: currentUser.name || '',
            title: currentUser.title || '',
            phone: currentUser.phone || '',
            address: currentUser.address || '',
            summary: currentUser.summary || '',
            skills: currentUser.skills.map(s => s.name).join(', ')
        });
    }
  }, [currentUser, activeTab]);

  useEffect(() => {
    if (currentUser && !isServerError) {
       fetchMessages();
       fetchNotifications();
    }
  }, [currentUser, activeTab, isServerError]);

  const fetchInitialData = async () => {
    setIsInitialLoading(true);
    setIsServerError(false);
    try {
       console.log("Connecting to API at:", API_URL);
       const [uRes, jRes, aRes] = await Promise.all([
         fetch(`${API_URL}/users`),
         fetch(`${API_URL}/jobs`),
         fetch(`${API_URL}/applications`)
       ]);

       if(!uRes.ok || !jRes.ok || !aRes.ok) throw new Error("API responded with an error status.");

       setUsers(await uRes.json());
       setJobs(await jRes.json());
       setApplications(await aRes.json());
    } catch (e) {
       console.error("Failed to fetch initial data.", e);
       setIsServerError(true); 
       setUsers([]);
       setJobs([]);
       setApplications([]);
    } finally {
       setIsInitialLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/messages/${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) { console.error("Msg fetch err", e); }
  };

  const fetchNotifications = async () => {
      if (!currentUser) return;
      try {
          const res = await fetch(`${API_URL}/notifications/${currentUser.id}`);
          if(res.ok) setNotifications(await res.json());
      } catch (e) { console.error("Note fetch err", e); }
  };

  const pushNotification = async (userId: string, title: string, message: string, type: 'info'|'success'|'warning' = 'info') => {
    try {
        await fetch(`${API_URL}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, title, message, type })
        });
        if(currentUser?.id === userId) fetchNotifications();
    } catch(e) { console.error(e); }
  };

  const markAsRead = async (noteId: string) => {
    try {
        await fetch(`${API_URL}/notifications/${noteId}/read`, { method: 'PUT' });
        setNotifications(prev => prev.map(n => n.id === noteId ? { ...n, read: true } : n));
    } catch(e) { console.error(e); }
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    try {
        await fetch(`${API_URL}/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        setNotifications(prev => prev.map(n => ({...n, read: true})));
    } catch(e) { console.error(e); }
  };

  // Messaging Actions
  const handleSendMessage = async (toId: string, subject: string, content: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromId: currentUser.id,
          toId: toId,
          fromName: currentUser.name,
          subject: subject,
          content: content,
          isAi: false
        })
      });
      if (res.ok) {
        fetchMessages();
        setIsComposeOpen(false);
        setReplyText('');
        showAlert("Message Sent", "Your message has been delivered.", "success");
      }
    } catch (e) { showAlert("Error", "Could not send message", "error"); }
  };

  const markMessageAsRead = async (msg: Message) => {
    if (msg.read) return;
    try {
      await fetch(`${API_URL}/messages/${msg.id}/read`, { method: 'PUT' });
      fetchMessages();
    } catch (e) { console.error(e); }
  };

  // Helper Utils
  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setAlertState({ open: true, title, message, type });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, open: false }));
  };

  const handleFileUpload = (file: File, callback: (base64: string, name: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => {
      callback(reader.result as string, file.name);
    };
    reader.readAsDataURL(file);
  };

  const downloadResume = (base64: string, filename: string) => {
      const link = document.createElement("a");
      link.href = base64;
      link.download = filename || "resume.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Authentication & Session
  const triggerAuth = () => {
    if (isServerError) {
        showAlert("System Offline", TECH_ERROR_MSG, "error");
        return;
    }
    setRegForm(getInitialRegForm()); // Reset Login/Reg Form
    setActiveTab('auth_login');
    setRegStep(1);
    setEnteredOTP('');
  };

  const handleInitiateRegister = async () => {
    if (!regForm.name || !regForm.email || !regForm.password) return showAlert("Validation Error", "Please fill essential fields", "warning");
    setAuthLoading(true);
    try {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      showAlert("Verify Account", "Registration successful! Please check your email for the verification code.", "success");
      setActiveTab('auth_verify_otp');
    } catch (err: any) {
      const msg = err.message === 'Failed to fetch' ? TECH_ERROR_MSG : err.message;
      showAlert("System Error", msg, "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!enteredOTP) return showAlert("Input Required", "Please enter the verification code.", "warning");
    setAuthLoading(true);
    try {
      const email = activeTab === 'auth_verify_otp' ? regForm.email : forgotEmail; 
      const res = await fetch(`${AUTH_URL}/verify`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, otp: enteredOTP })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Verification failed');
      if (data.user && data.token) {
        setCurrentUser(data.user);
        localStorage.setItem('jf_session', JSON.stringify(data.user));
        fetchInitialData();
        setRegStep(1);
        setEnteredOTP('');
        pushNotification(data.user.id, "Welcome to JobFinder!", "Account verified successfully.", 'success');
        showAlert("Welcome!", "Account verified. You are now logged in.", "success");
        setActiveTab(data.user.role === UserRole.RECRUITER ? 'dashboard' : 'search_job');
      } else {
         showAlert("Verified", "Verification successful, please login.", "info");
         setActiveTab('auth_login');
      }
    } catch (err: any) {
       const msg = err.message === 'Failed to fetch' ? TECH_ERROR_MSG : err.message;
       showAlert("System Error", msg, "error");
    } finally {
       setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!regForm.email || !regForm.password) return showAlert("Input Required", "Please enter email and password", "warning");
    setAuthLoading(true);
    try {
       const res = await fetch(`${AUTH_URL}/login`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email: regForm.email, password: regForm.password })
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.message || 'Login failed');
       setCurrentUser(data.user);
       localStorage.setItem('jf_session', JSON.stringify(data.user));
       setActiveTab(data.user.role === UserRole.RECRUITER ? 'dashboard' : 'search_job');
       setRegForm(getInitialRegForm()); // Clear form after success
    } catch (err: any) {
       const msg = err.message === 'Failed to fetch' ? TECH_ERROR_MSG : err.message;
       showAlert("System Error", msg, "error");
    } finally {
       setAuthLoading(false);
    }
  };

  const handleForgotPasswordRequest = async () => {
    if (!forgotEmail) return showAlert("Input Required", "Please enter your email", "warning");
    setAuthLoading(true);
    try {
      const res = await fetch(`${AUTH_URL}/forgot-password`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showAlert("OTP Sent", "A verification code has been sent to your email.", "info");
      setActiveTab('auth_reset_password');
    } catch (err: any) {
       const msg = err.message === 'Failed to fetch' ? TECH_ERROR_MSG : err.message;
       showAlert("System Error", msg, "error");
    } finally {
       setAuthLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!enteredOTP || !newPassword) return showAlert("Input Required", "Fill all fields", "warning");
    setAuthLoading(true);
    try {
       const res = await fetch(`${AUTH_URL}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: forgotEmail, otp: enteredOTP, newPassword })
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.message);
       showAlert("Success", "Password updated successfully. Please login.", "success");
       setActiveTab('auth_login');
       setEnteredOTP('');
       setNewPassword('');
    } catch (err: any) {
       const msg = err.message === 'Failed to fetch' ? TECH_ERROR_MSG : err.message;
       showAlert("System Error", msg, "error");
    } finally {
       setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('jf_session');
    setRegForm(getInitialRegForm());
    setActiveTab('auth_login');
    setIsSidebarOpen(false);
  };

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    setIsProfileSaving(true);
    try {
        const skillsArray = profileForm.skills.split(',').map(s => ({ name: s.trim(), level: 'Intermediate' }));
        const payload = {
            name: profileForm.name,
            title: profileForm.title,
            phone: profileForm.phone,
            address: profileForm.address,
            summary: profileForm.summary,
            skills: skillsArray
        };
        const res = await fetch(`${API_URL}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const updatedUser = await res.json();
            setCurrentUser(updatedUser);
            localStorage.setItem('jf_session', JSON.stringify(updatedUser));
            showAlert("Profile Updated", "Your changes have been saved successfully.", "success");
        } else {
            throw new Error("Failed to update");
        }
    } catch (e) {
        showAlert("Error", "Could not save profile changes.", "error");
    } finally {
        setIsProfileSaving(false);
    }
  };

  // Job Application Flow
  const handleJobClick = (job: JobListing) => {
    setResearchResult(null); 
    setShowResearch(false);
    setSelectedJobDetail(job);
    setActiveTab('job_details'); // Switch to the details tab page
  };

  const handleApplyClick = (job: JobListing) => {
    if (!currentUser) {
       setSelectedJobDetail(null);
       return triggerAuth();
    }
    if (currentUser.role === UserRole.RECRUITER) return showAlert("Access Denied", "Recruiters cannot apply for jobs.", "warning");
    if (applications.some(a => a.jobId === job.id && a.userId === currentUser.id)) return showAlert("Already Applied", "You have already submitted an application for this position.", "info");
    
    setSelectedJob(job);
    // Keep detail view if we are on it, otherwise detail is null
    setShowApplyModal(true);
  };

  const handleResearchCompany = async (company: string) => {
    setShowResearch(true);
    if (!researchResult) {
        setResearchLoading(true);
        const result = await researchCompany(company);
        setResearchResult(result);
        setResearchLoading(false);
    }
  };

  const confirmApplication = async (updatedResume?: string, updatedResumeName?: string) => {
    if (!currentUser || !selectedJob) return;
    let userToApply = currentUser;
    if (updatedResume && updatedResumeName) {
      userToApply = { ...currentUser, resume: updatedResume, resumeName: updatedResumeName };
      try {
            const uRes = await fetch(`${API_URL}/users/${currentUser.id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ resume: updatedResume, resumeName: updatedResumeName })
            });
            if(uRes.ok) {
              const updatedUser = await uRes.json();
              setCurrentUser(updatedUser);
              localStorage.setItem('jf_session', JSON.stringify(updatedUser));
            }
      } catch(e) { console.error("Resume update failed", e); }
    }

    const match = await analyzeApplicationMatch(userToApply, selectedJob);
    const newAppPayload = {
      jobId: selectedJob.id, 
      userId: userToApply.id,
      status: ApplicationStatus.INTERVIEW_PENDING,
      matchScore: match.score, 
      aiAnalysis: match.analysis
    };

    try {
        const res = await fetch(`${API_URL}/applications`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newAppPayload)
        });
        if(!res.ok) throw new Error("App creation failed");
        const savedApp = await res.json();
        setApplications([...applications, savedApp]);

        pushNotification(selectedJob.postedBy, "New Application", `${userToApply.name} applied for ${selectedJob.title}. Match: ${match.score}%`);
        pushNotification(userToApply.id, "Application Received", `Thank you for applying to ${selectedJob.title}. Please complete your AI interview to finalize the process.`, 'success');
        showAlert("Application Submitted", "Your application has been received. You are now required to complete a short AI interview with Warren to finalize your application.", "success");
        
        setShowApplyModal(false);
        setSelectedJob(null);
    } catch(e) { showAlert("Error", "Failed to submit application", "error"); }
  };

  const startPracticeInterview = () => {
     if(!practiceJD.trim()) return showAlert("Missing Info", "Please paste a job description first.", "warning");
     if(!currentUser) return triggerAuth();
     const tempJob: JobListing = {
        id: 'practice_job',
        title: 'Practice Role',
        company: 'Practice Corp',
        location: 'Remote',
        type: 'Full-time',
        salaryRange: 'N/A',
        description: practiceJD,
        requirements: [],
        questions: [],
        postedBy: 'system',
        postedDate: new Date().toISOString(),
        interviewSetting: 'OPEN'
     };
     setInterviewJob(tempJob);
     setIsPractice(true);
     setIsInterviewOpen(true);
  };

  const handlePracticeResumeUpload = (file: File) => {
     handleFileUpload(file, (base64, name) => {
        if (currentUser) {
            setCurrentUser({ ...currentUser, resume: base64, resumeName: name });
            showAlert("Resume Attached", "Resume uploaded for this practice session.", "success");
        }
     });
  };

  const handlePostJob = async () => {
    if (!currentUser) return;
    const requirements = jobForm.reqs.split(',').map(s=>s.trim());
    const newJobPayload = {
      title: jobForm.title, company: jobForm.company, location: jobForm.location,
      type: jobForm.type, salaryRange: jobForm.salary, description: jobForm.desc,
      requirements: requirements, questions: jobForm.questions.split(',').map(s=>s.trim()),
      postedBy: currentUser.id,
      interviewSetting: jobForm.interviewSetting
    };
    try {
        const res = await fetch(`${API_URL}/jobs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newJobPayload)
        });
        if(!res.ok) throw new Error("Job post failed");
        const savedJob = await res.json();
        setJobs([...jobs, savedJob]);
        
        users.filter(u => u.role === UserRole.CANDIDATE).forEach(candidate => {
           const hasSkillMatch = candidate.skills.some(skill => 
              requirements.some(req => req.toLowerCase().includes(skill.name.toLowerCase()))
           );
           const hasTitleMatch = savedJob.title.toLowerCase().includes(candidate.title.toLowerCase());
           if (hasSkillMatch || hasTitleMatch) {
              pushNotification(candidate.id, "New Job Alert", `A new job "${savedJob.title}" at ${savedJob.company} matches your profile!`, 'success');
           }
        });
        showAlert("Job Posted", "Your job listing has been created and alerts sent to matching candidates.", "success");
        setJobForm(getInitialJobForm()); // Reset Form
        setActiveTab('dashboard');
    } catch(e) { showAlert("Error", "Failed to post job", "error"); }
  };

  const handleReviewClick = (app: Application) => {
    setReviewApp(app);
  };

  const handleInterviewComplete = async (transcript: ChatMessage[], recordingData?: string, recordingType?: 'audio/webm' | 'video/webm') => {
     if(!currentUser || !interviewJob) return;
     const [feedbackSummary, recruiterSummary] = await Promise.all([
         generateInterviewFeedback(transcript, interviewJob),
         generateRecruiterSummary(transcript, interviewJob, currentUser)
     ]);

     if (isPractice) {
        setPracticeFeedback({ candidate: feedbackSummary, recruiter: recruiterSummary });
        setIsInterviewOpen(false);
        setInterviewJob(null);
        setIsPractice(false);
        setShowPracticeResults(true);
        return;
     }
     
     const app = applications.find(a => a.jobId === interviewJob.id && a.userId === currentUser.id);
     if(!app) return;

     const updatePayload = {
         status: ApplicationStatus.INTERVIEW_COMPLETED,
         transcript: transcript,
         recordingData: recordingData,
         recordingType: recordingType,
         interviewSummary: recruiterSummary
     };

     try {
         const res = await fetch(`${API_URL}/applications/${app.id}`, {
             method: 'PUT',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify(updatePayload)
         });
         if(res.ok) {
             const updatedApp = await res.json();
             setApplications(prev => prev.map(a => a.id === updatedApp.id ? updatedApp : a));
             setIsInterviewOpen(false);
             setInterviewJob(null);
             await fetch(`${API_URL}/interview/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicantId: currentUser.id, jobTitle: interviewJob.title, feedback: feedbackSummary })
             });
             await fetch(`${API_URL}/interview/notify-recruiter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                   recruiterId: interviewJob.postedBy, 
                   applicantName: currentUser.name, 
                   jobTitle: interviewJob.title, 
                   summary: recruiterSummary 
                })
             });
             pushNotification(interviewJob.postedBy, "Interview Completed", `${currentUser.name} finished interview for ${interviewJob.title}.`);
             showAlert("Interview Completed", "Thank you! A confirmation email has been sent. The recruiter has been notified.", "success");
         }
     } catch (e) { console.error("Failed to finalize interview", e); showAlert("Error", "Failed to save interview. Please contact support.", "error"); }
  };

  const sendFinalInvite = async () => {
    if (!reviewApp || !currentUser) return;
    const appUser = users.find(u => u.id === reviewApp.userId);
    const appJob = jobs.find(j => j.id === reviewApp.jobId);
    if (!appUser || !appJob) return;

    try {
      await fetch(`${API_URL}/recruit/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           applicantId: appUser.id,
           jobTitle: appJob.title,
           company: appJob.company,
           type: inviteForm.type,
           date: inviteForm.date,
           time: inviteForm.time,
           location: inviteForm.location
        })
      });
      const res = await fetch(`${API_URL}/applications/${reviewApp.id}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ status: ApplicationStatus.FINAL_INVITE_SENT })
      });
      if(res.ok) {
          const updated = await res.json();
          setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
          pushNotification(reviewApp.userId, "Interview Invitation", `You have been invited to a final interview for ${appJob.title}! Check your email.`);
          showAlert("Invitation Sent", "Invitations have been sent to both you and the candidate.", "success");
          setInviteModalOpen(false);
          setReviewApp(null);
      }
    } catch (e) { showAlert("Error", "Could not send invitation.", "error"); }
  };

  const handleRejectApplication = async () => {
    if (!reviewApp || !currentUser) return;
    const appUser = users.find(u => u.id === reviewApp.userId);
    const appJob = jobs.find(j => j.id === reviewApp.jobId);
    if (!appUser || !appJob) return;
    if(!window.confirm("Are you sure you want to reject this candidate? This action cannot be undone.")) return;

    try {
       await fetch(`${API_URL}/recruit/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicantId: appUser.id, jobTitle: appJob.title, company: appJob.company })
       });
       const res = await fetch(`${API_URL}/applications/${reviewApp.id}`, {
           method: 'PUT',
           headers: {'Content-Type': 'application/json'},
           body: JSON.stringify({ status: ApplicationStatus.REJECTED })
       });
       if (res.ok) {
          const updated = await res.json();
          setApplications(prev => prev.map(a => a.id === updated.id ? updated : a));
          pushNotification(reviewApp.userId, "Application Update", `Your application for ${appJob.title} has been updated. Please check your email.`);
          showAlert("Application Rejected", "Rejection email sent successfully.", "info");
          setReviewApp(null);
       }
    } catch(e) { showAlert("Error", "Failed to reject application.", "error"); }
  };

  const uniqueLocations = Array.from(new Set(jobs.map(j => j.location))).filter(Boolean);
  const uniqueJobTitles = Array.from(new Set(jobs.map(j => j.title))).slice(0, 5);
  const filteredJobs = jobs.filter(job => {
     const matchesSearch = job.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           job.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           job.description.toLowerCase().includes(searchTerm.toLowerCase());
     const matchesLoc = filterLocation === 'All' || job.location === filterLocation;
     const matchesType = filterType ? job.type === filterType : true;
     return matchesSearch && matchesLoc && matchesType;
  });

  const navItemClass = (id: string) => 
    `flex items-center gap-4 px-8 py-4 transition-all duration-200 relative group cursor-pointer ${activeTab === id ? 'text-primary' : 'text-gray-400 hover:text-white'}`;
  
  const navActiveIndicator = () => (
    <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary rounded-l-md shadow-[0_0_15px_rgba(253,185,19,0.5)]"></div>
  );

  const unreadNotesCount = notifications.filter(n => n.userId === currentUser?.id && !n.read).length;
  const unreadMsgCount = messages.filter(m => m.toId === currentUser?.id && !m.read).length;
  const allRecruiterApps = applications.filter(a => jobs.some(j => j.id === a.jobId && j.postedBy === currentUser?.id));
  
  const getFilteredRecruiterApps = () => {
    switch(recruiterFilterMode) {
        case 'NEW':
            return allRecruiterApps.filter(a => a.status === ApplicationStatus.INTERVIEW_COMPLETED);
        case 'PENDING':
            return allRecruiterApps.filter(a => a.status === ApplicationStatus.APPLIED || a.status === ApplicationStatus.INTERVIEW_PENDING || a.status === ApplicationStatus.AI_SCREENING);
        case 'INVITED':
            return allRecruiterApps.filter(a => a.status === ApplicationStatus.FINAL_INVITE_SENT);
        case 'REJECTED':
            return allRecruiterApps.filter(a => a.status === ApplicationStatus.REJECTED);
        default:
            return allRecruiterApps;
    }
  };
  const displayApps = getFilteredRecruiterApps();

  if (isInitialLoading) {
      return (
          <div className="flex flex-col h-screen w-screen items-center justify-center bg-white">
             <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary mb-4"></div>
             <p className="text-gray-500 font-medium">Loading JobFinder...</p>
          </div>
      );
  }

  /* --- AUTH PAGES (Login / Register) --- */
  if (['auth_login', 'auth_register', 'auth_verify_otp', 'auth_forgot', 'auth_reset_password'].includes(activeTab)) {
    return (
      <div className="min-h-screen flex bg-white font-sans">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex w-1/2 bg-black flex-col justify-between p-12 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-black font-black text-xl shadow-lg transform rotate-3">J</div>
              <span className="font-bold text-2xl text-white tracking-tight">JobFinder<span className="text-primary">.</span></span>
            </div>
            <h1 className="text-5xl font-extrabold text-white leading-tight mb-4">
              Hire Smart.<br/>
              <span className="text-primary">Find Faster.</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-md">Experience the future of recruitment with AI-driven matching and automated interviews.</p>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-gray-800 rounded-full overflow-hidden border-2 border-primary flex items-center justify-center">
                  <span className="text-white font-bold text-lg">OZ</span>
               </div>
               <div>
                  <div className="text-white font-bold">Onwabe Zibeke</div>
                  <div className="text-gray-500 text-sm">Lead Developer, JobFinder</div>
               </div>
            </div>
            <p className="mt-4 text-gray-300 italic">"Our mission is to eliminate bias and inefficiency in hiring through the power of Generative AI."</p>
          </div>
          {/* Decorative Circle */}
          <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary opacity-10 rounded-full blur-3xl pointer-events-none"></div>
        </div>

        {/* Right Side - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-20 overflow-y-auto">
          <div className="w-full max-w-md space-y-8">
            
            {activeTab === 'auth_login' && (
              <div className="animate-fade-in">
                <div className="mb-10">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
                  <p className="text-gray-500">Please enter your details to sign in.</p>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                    <input type="email" autoComplete="username" placeholder="name@company.com" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-bold text-gray-700">Password</label>
                      <button onClick={() => setActiveTab('auth_forgot')} className="text-xs font-bold text-primary hover:text-black">Forgot Password?</button>
                    </div>
                    <input type="password" autoComplete="current-password" placeholder="••••••••" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition" value={regForm.password} onChange={e => setRegForm({...regForm, password: e.target.value})} />
                  </div>
                  <button onClick={handleLogin} disabled={authLoading} className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 transition shadow-lg flex justify-center items-center gap-2">
                    {authLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Sign In'}
                  </button>
                  <div className="text-center mt-6 text-gray-500">
                    Don't have an account? <button onClick={() => { setActiveTab('auth_register'); setRegStep(1); setRegForm(getInitialRegForm()); }} className="font-bold text-black hover:text-primary">Create Account</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'auth_register' && (
              <div className="animate-fade-in">
                <div className="mb-8">
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h2>
                  <p className="text-gray-500">Join the professional network today.</p>
                </div>

                {regStep === 1 && (
                  <div className="space-y-5">
                    <div className="flex gap-4 p-1 bg-gray-100 rounded-2xl mb-6">
                      <button onClick={() => setRegForm({...regForm, role: UserRole.CANDIDATE})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition shadow-sm ${regForm.role === UserRole.CANDIDATE ? 'bg-white text-black' : 'text-gray-500 hover:bg-gray-200'}`}>Candidate</button>
                      <button onClick={() => setRegForm({...regForm, role: UserRole.RECRUITER})} className={`flex-1 py-3 rounded-xl text-sm font-bold transition shadow-sm ${regForm.role === UserRole.RECRUITER ? 'bg-white text-black' : 'text-gray-500 hover:bg-gray-200'}`}>Recruiter</button>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                      <input type="text" autoComplete="off" placeholder="John Doe" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                      <input type="email" autoComplete="new-password" placeholder="john@example.com" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                      <input type="password" autoComplete="new-password" placeholder="••••••••" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.password} onChange={e => setRegForm({...regForm, password: e.target.value})} />
                    </div>
                    <button onClick={() => setRegStep(2)} className="w-full bg-black text-white py-4 rounded-xl font-bold mt-4">Continue →</button>
                    <div className="text-center mt-6 text-gray-500">
                      Already have an account? <button onClick={() => { setActiveTab('auth_login'); setRegForm(getInitialRegForm()); }} className="font-bold text-black hover:text-primary">Sign In</button>
                    </div>
                  </div>
                )}

                {regStep === 2 && (
                  <div className="space-y-5">
                    <button onClick={() => setRegStep(1)} className="text-sm font-bold text-gray-500 hover:text-black mb-4">← Back</button>
                    <h3 className="text-lg font-bold text-gray-900 border-b pb-2 mb-4">Professional Details</h3>
                    {regForm.role === UserRole.RECRUITER ? (
                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Company Name</label>
                          <input type="text" autoComplete="off" placeholder="e.g. Google" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.company} onChange={e => setRegForm({...regForm, company: e.target.value})} />
                       </div>
                    ) : (
                       <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Current Job Title</label>
                          <input type="text" autoComplete="off" placeholder="e.g. Frontend Developer" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.title} onChange={e => setRegForm({...regForm, title: e.target.value})} />
                       </div>
                    )}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Phone Number</label>
                        <input type="text" autoComplete="off" placeholder="+1 234 567 890" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.phone} onChange={e => setRegForm({...regForm, phone: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Location / Address</label>
                        <input type="text" autoComplete="off" placeholder="New York, NY" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={regForm.address} onChange={e => setRegForm({...regForm, address: e.target.value})} />
                    </div>
                    
                    <button onClick={handleInitiateRegister} disabled={authLoading} className="w-full bg-primary text-black py-4 rounded-xl font-bold shadow-lg flex justify-center items-center gap-2">
                       {authLoading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div> : 'Complete Registration'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(activeTab === 'auth_verify_otp' || activeTab === 'auth_reset_password') && (
              <div className="animate-fade-in text-center">
                 <div className="mb-8">
                    <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">✉️</div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">Check Your Email</h2>
                    <p className="text-gray-500">We've sent a verification code to your inbox.</p>
                 </div>
                 <div className="space-y-6">
                    <input type="text" autoComplete="off" placeholder="Enter 6-digit Code" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-3xl font-bold tracking-widest focus:border-primary outline-none" value={enteredOTP} onChange={e => setEnteredOTP(e.target.value)} maxLength={6} />
                    {activeTab === 'auth_reset_password' && (
                        <input type="password" placeholder="New Password" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 text-center" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    )}
                    <button onClick={activeTab === 'auth_verify_otp' ? handleVerifyOTP : handlePasswordReset} disabled={authLoading} className="w-full bg-black text-white py-4 rounded-xl font-bold">
                       {authLoading ? 'Verifying...' : 'Verify & Continue'}
                    </button>
                    <button onClick={() => { setActiveTab('auth_login'); setRegForm(getInitialRegForm()); }} className="text-sm font-bold text-gray-400 hover:text-black">Cancel</button>
                 </div>
              </div>
            )}

            {activeTab === 'auth_forgot' && (
               <div className="animate-fade-in">
                  <div className="mb-8">
                     <h2 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h2>
                     <p className="text-gray-500">Enter your email to receive a reset code.</p>
                  </div>
                  <div className="space-y-6">
                     <input type="email" autoComplete="off" placeholder="Email Address" className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 focus:border-primary outline-none" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />
                     <button onClick={handleForgotPasswordRequest} disabled={authLoading} className="w-full bg-black text-white py-4 rounded-xl font-bold">
                        {authLoading ? 'Sending...' : 'Send Reset Code'}
                     </button>
                     <div className="text-center">
                        <button onClick={() => { setActiveTab('auth_login'); setRegForm(getInitialRegForm()); }} className="text-sm font-bold text-gray-500 hover:text-black">Back to Login</button>
                     </div>
                  </div>
               </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  /* --- MAIN APP LAYOUT --- */
  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden relative">
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-72 bg-black flex flex-col shadow-2xl transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:rounded-r-3xl lg:my-4 lg:ml-4`}>
        <div className="p-8 flex items-center justify-between lg:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-black font-black text-xl shadow-lg transform rotate-3">J</div>
            <span className="font-bold text-2xl text-white tracking-tight">JobFinder<span className="text-primary">.</span></span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-400">✕</button>
        </div>

        <nav className="flex-1 mt-6 space-y-1 overflow-y-auto scrollbar-hide">
          {currentUser?.role === UserRole.RECRUITER ? (
            <>
              <div onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} className={navItemClass('dashboard')}>
                <Icons.Dashboard /> <span className="font-medium">Dashboard</span>
                {activeTab === 'dashboard' && navActiveIndicator()}
              </div>
              <div onClick={() => { 
                setJobForm(getInitialJobForm()); // Reset Job Form on Click
                setActiveTab('post_job'); 
                setIsSidebarOpen(false); 
              }} className={navItemClass('post_job')}>
                 <Icons.Plus /> <span className="font-medium">Post Job</span>
                 {activeTab === 'post_job' && navActiveIndicator()}
              </div>
            </>
          ) : (
            <>
              <div onClick={() => { setActiveTab('search_job'); setIsSidebarOpen(false); }} className={navItemClass('search_job')}>
                <Icons.SearchJob /> <span className="font-medium">Search Job</span>
                {activeTab === 'search_job' && navActiveIndicator()}
              </div>
              <div onClick={() => { currentUser ? setActiveTab('applications') : triggerAuth(); setIsSidebarOpen(false); }} className={navItemClass('applications')}>
                <Icons.Applications /> <span className="font-medium">Applications</span>
                {activeTab === 'applications' && navActiveIndicator()}
              </div>
              <div onClick={() => { currentUser ? setActiveTab('practice') : triggerAuth(); setIsSidebarOpen(false); }} className={navItemClass('practice')}>
                <Icons.Practice /> <span className="font-medium">Practice Interview</span>
                {activeTab === 'practice' && navActiveIndicator()}
              </div>
            </>
          )}

          <div onClick={() => { currentUser ? setActiveTab('messages') : triggerAuth(); setIsSidebarOpen(false); }} className={navItemClass('messages')}>
            <div className="relative">
               <Icons.Message />
               {unreadMsgCount > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black"></span>}
            </div>
            <span className="font-medium">Message</span>
            {activeTab === 'messages' && navActiveIndicator()}
          </div>
          
          <div onClick={() => { setActiveTab('news'); setIsSidebarOpen(false); }} className={navItemClass('news')}>
            <div className="relative">
               <Icons.Bell />
               {unreadNotesCount > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black"></span>}
            </div>
            <span className="font-medium">Notifications</span>
            {activeTab === 'news' && navActiveIndicator()}
          </div>
          
          {currentUser && (
             <div onClick={() => { setActiveTab('profile'); setIsSidebarOpen(false); }} className={navItemClass('profile')}>
               <Icons.User /> <span className="font-medium">My Profile</span>
               {activeTab === 'profile' && navActiveIndicator()}
             </div>
          )}
        </nav>

        <div className="p-6">
           {currentUser ? (
             <div className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center gap-3 border border-gray-800 cursor-pointer" onClick={() => setActiveTab('profile')}>
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-black overflow-hidden">
                   {currentUser.avatar ? <img src={currentUser.avatar} alt="Me" className="w-full h-full object-cover" /> : currentUser.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                   <div className="text-white font-bold truncate text-sm">{currentUser.name}</div>
                   <div className="text-gray-500 text-xs truncate">{currentUser.title}</div>
                </div>
                <button onClick={(e) => {e.stopPropagation(); handleLogout();}} className="text-gray-400 hover:text-red-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
             </div>
           ) : (
             <div className="bg-[#1a1a1a] p-4 rounded-2xl border border-gray-800 text-center">
               <p className="text-gray-400 text-xs mb-3">Join JobFinder to apply</p>
               <button onClick={triggerAuth} className="w-full bg-primary text-black py-2 rounded-xl font-bold shadow-lg hover:bg-primary-hover transition text-sm">
                 Login / Register
               </button>
             </div>
           )}
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Responsive Header */}
        <header className="flex flex-wrap md:flex-nowrap items-center justify-between px-6 md:px-10 py-6 bg-white z-20 gap-4">
           {/* Left: Menu & Title */}
           <div className="flex items-center gap-4">
               <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 bg-white rounded-lg shadow-sm text-gray-600">
                 <Icons.Menu />
               </button>
               <div>
                 <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                   {activeTab === 'profile' ? 'My Profile' :
                    activeTab === 'search_job' ? 'Search Jobs' : 
                    activeTab === 'job_details' ? 'Job Details' :
                    activeTab === 'dashboard' ? 'Dashboard' : 
                    activeTab === 'applications' ? 'My Applications' : 
                    activeTab === 'practice' ? 'Practice Interview' :
                    activeTab === 'messages' ? 'Messages' : 
                    activeTab === 'post_job' ? 'Create Job' : 'Notifications'}
                 </h1>
                 {activeTab === 'search_job' && <p className="text-gray-400 text-sm mt-1 hidden md:block">Find your dream career today</p>}
               </div>
           </div>

           {/* Right: Actions & User */}
           <div className="flex items-center justify-end gap-3 md:gap-6 order-2 md:order-3 ml-auto md:ml-0">
                <button onClick={() => setActiveTab('messages')} className="relative text-gray-500 hover:text-black transition">
                   <Icons.Message />
                   {unreadMsgCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadMsgCount}
                      </span>
                   )}
                </button>
                <button onClick={() => setActiveTab('news')} className="relative text-gray-500 hover:text-black transition">
                   <Icons.Bell />
                   {unreadNotesCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadNotesCount}
                      </span>
                   )}
                </button>
                
                <div className="pl-2 md:pl-4 border-l border-gray-200">
                  {currentUser ? (
                    <div onClick={() => setActiveTab('profile')} className="w-10 h-10 rounded-full bg-black text-primary flex items-center justify-center font-bold shadow-md cursor-pointer hover:scale-105 transition overflow-hidden" title={currentUser.name}>
                       {currentUser.avatar ? <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" /> : currentUser.name[0]}
                    </div>
                  ) : (
                    <button onClick={triggerAuth} className="bg-primary text-black px-5 py-2 rounded-full text-sm font-bold hover:bg-black hover:text-white transition shadow-md">
                      Login
                    </button>
                  )}
                </div>
           </div>

           {/* Center/Bottom: Search Bar */}
           {activeTab === 'search_job' && (
               <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-xl">
                   <div className="flex items-center gap-4 bg-gray-50 px-2 py-2 rounded-full shadow-sm w-full">
                      <div className="relative w-full">
                         <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400"><Icons.SearchJob /></div>
                         <input 
                            type="text" 
                            placeholder="Search jobs..." 
                            className="pl-12 pr-6 py-3 bg-gray-50 rounded-full w-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                         />
                      </div>
                   </div>
               </div>
           )}
        </header>

        {/* Scrollable Main View */}
        <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10">

            {/* PROFILE EDIT */}
            {activeTab === 'profile' && currentUser && (
                <div className="max-w-3xl mx-auto bg-gray-50 border border-gray-100 rounded-[2rem] shadow-sm p-8">
                    <h2 className="text-2xl font-bold mb-6">Edit Profile</h2>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                                <input className="w-full p-3 bg-white rounded-xl border border-gray-200" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Job Title / Role</label>
                                <input className="w-full p-3 bg-white rounded-xl border border-gray-200" value={profileForm.title} onChange={e => setProfileForm({...profileForm, title: e.target.value})} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Phone</label>
                                <input className="w-full p-3 bg-white rounded-xl border border-gray-200" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Address / Location</label>
                                <input className="w-full p-3 bg-white rounded-xl border border-gray-200" value={profileForm.address} onChange={e => setProfileForm({...profileForm, address: e.target.value})} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Professional Summary</label>
                            <textarea className="w-full p-3 bg-white rounded-xl border border-gray-200 h-32" value={profileForm.summary} onChange={e => setProfileForm({...profileForm, summary: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Skills (comma separated)</label>
                            <input className="w-full p-3 bg-white rounded-xl border border-gray-200" placeholder="e.g. React, Node.js, Python" value={profileForm.skills} onChange={e => setProfileForm({...profileForm, skills: e.target.value})} />
                        </div>
                        
                        <div className="pt-4 border-t border-gray-100 flex justify-end">
                            <button 
                                onClick={handleUpdateProfile} 
                                disabled={isProfileSaving}
                                className="bg-black text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-gray-800 disabled:opacity-50"
                            >
                                {isProfileSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
           
           {/* JOB DETAILS PAGE (Dedicated View) */}
           {activeTab === 'job_details' && selectedJobDetail && (
             <div className="max-w-5xl mx-auto animate-fade-in">
                {/* Back Button */}
                <button 
                  onClick={() => setActiveTab('search_job')}
                  className="mb-6 flex items-center gap-2 text-gray-500 hover:text-black font-bold text-sm transition"
                >
                   <Icons.ArrowLeft className="w-5 h-5" /> Back to Search
                </button>

                <div className="flex flex-col lg:flex-row gap-8">
                   {/* Left Column: Main Content */}
                   <div className="flex-1 space-y-8">
                      {/* Header */}
                      <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                         <h2 className="text-4xl font-black text-gray-900 mb-2 relative z-10">{selectedJobDetail.title}</h2>
                         <div className="flex items-center gap-4 text-gray-600 mb-6 relative z-10">
                            <span className="font-bold text-lg">{selectedJobDetail.company}</span>
                            <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                            <span className="text-gray-500">{selectedJobDetail.location}</span>
                         </div>
                         <button 
                             onClick={() => handleResearchCompany(selectedJobDetail.company)}
                             className="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-full font-bold hover:bg-blue-100 transition flex items-center gap-2 w-fit border border-blue-100"
                          >
                             <Icons.Star className="w-4 h-4"/> Research Company
                          </button>
                      </div>

                      {/* Research Result Section */}
                      {showResearch && (
                          <div className="animate-fade-in">
                              {researchLoading ? (
                                 <div className="p-6 bg-gray-50 rounded-[2rem] flex items-center gap-3">
                                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-gray-600 font-medium">Researching company culture and news...</span>
                                 </div>
                              ) : researchResult && (
                                 <div className="p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-[2rem] border border-blue-100 shadow-sm">
                                    <h4 className="font-bold text-blue-900 mb-4 flex items-center gap-2 text-lg">
                                      <Icons.Info className="w-6 h-6"/> AI Research Summary
                                    </h4>
                                    <p className="text-blue-800 leading-relaxed mb-6">{researchResult.text}</p>
                                    {researchResult.links && researchResult.links.length > 0 && (
                                       <div className="flex flex-wrap gap-2">
                                          {researchResult.links.map((link: any, i: number) => (
                                             link.web && (
                                                <a key={i} href={link.web.uri} target="_blank" rel="noopener noreferrer" className="text-xs bg-white text-blue-600 px-3 py-1.5 rounded-lg border border-blue-200 hover:border-blue-400 truncate max-w-[250px] font-medium shadow-sm hover:shadow">
                                                   {link.web.title}
                                                </a>
                                             )
                                          ))}
                                       </div>
                                    )}
                                 </div>
                              )}
                          </div>
                      )}

                      {/* Job Description */}
                      <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b pb-4">Job Description</h3>
                          <div className="prose text-gray-700 leading-relaxed whitespace-pre-wrap max-w-none">
                              {selectedJobDetail.description}
                          </div>
                      </div>

                      {/* Requirements */}
                      <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                          <h3 className="text-xl font-bold text-gray-900 mb-6 border-b pb-4">Requirements</h3>
                          <ul className="space-y-3">
                              {selectedJobDetail.requirements.map((req, i) => (
                                  <li key={i} className="flex items-start gap-3">
                                      <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0 mt-0.5">
                                          <Icons.Check className="w-4 h-4" />
                                      </div>
                                      <span className="text-gray-700">{req}</span>
                                  </li>
                              ))}
                          </ul>
                      </div>
                   </div>

                   {/* Right Column: Meta & Actions */}
                   <div className="lg:w-80 space-y-6">
                      <div className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm sticky top-6">
                          <div className="space-y-6">
                             <div>
                                <span className="block text-xs text-gray-400 uppercase font-bold mb-1">Salary Range</span>
                                <span className="block text-xl font-black text-gray-900">{selectedJobDetail.salaryRange}</span>
                             </div>
                             <div>
                                <span className="block text-xs text-gray-400 uppercase font-bold mb-1">Employment Type</span>
                                <span className="block font-medium text-gray-900 bg-gray-100 px-3 py-1 rounded-lg w-fit">{selectedJobDetail.type}</span>
                             </div>
                             <div>
                                <span className="block text-xs text-gray-400 uppercase font-bold mb-1">Posted Date</span>
                                <span className="block font-medium text-gray-900">{new Date(selectedJobDetail.postedDate).toLocaleDateString()}</span>
                             </div>

                             <button 
                                onClick={() => handleApplyClick(selectedJobDetail)} 
                                className="w-full bg-[#2b1c55] text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:bg-black transition flex items-center justify-center gap-2 mt-4"
                             >
                                Apply Now <Icons.Send className="w-4 h-4" />
                             </button>
                          </div>
                      </div>
                   </div>
                </div>
             </div>
           )}

           {/* SEARCH LIST (Only show if not viewing details) */}
           {activeTab === 'search_job' && (
             <div className="animate-fade-in space-y-8">
               <div className="bg-gray-50 border border-gray-100 p-2 md:p-4 rounded-3xl shadow-sm flex flex-row items-stretch gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl px-3 md:px-6 py-3 min-w-0 border border-gray-100">
                     <div className="text-primary shrink-0"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
                     <select 
                       className="bg-transparent font-medium text-gray-700 outline-none w-full cursor-pointer text-sm md:text-base"
                       value={filterLocation}
                       onChange={(e) => setFilterLocation(e.target.value)}
                     >
                       <option value="All">All Locations</option>
                       {uniqueLocations.map((loc, i) => <option key={i} value={loc}>{loc}</option>)}
                     </select>
                  </div>
                  
                  {/* Job Type Filter */}
                  <div className="relative group bg-white border border-gray-100 rounded-2xl flex items-center justify-center px-0 md:px-6 w-12 md:w-auto shrink-0 cursor-pointer">
                      <div className="pointer-events-none flex items-center gap-2">
                         <Icons.Filter className="w-5 h-5 text-gray-700" />
                         <span className="hidden md:block font-bold text-gray-700 text-sm whitespace-nowrap">
                            {filterType || "Any Type"}
                         </span>
                      </div>
                      <select 
                         className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                         value={filterType || ''}
                         onChange={e => setFilterType(e.target.value || null)}
                      >
                         <option value="">Any Type</option>
                         <option value="Full-time">Full-time</option>
                         <option value="Part-time">Part-time</option>
                         <option value="Contract">Contract</option>
                         <option value="Freelance">Freelance</option>
                         <option value="Internship">Internship</option>
                         <option value="Learnership">Learnership</option>
                      </select>
                  </div>

                  {/* Find Button */}
                  <button className="bg-[#2b1c55] text-white rounded-2xl px-0 md:px-8 w-12 md:w-auto shrink-0 flex items-center justify-center shadow-lg hover:bg-black transition">
                      <Icons.SearchJob className="w-5 h-5" />
                      <span className="hidden md:block ml-2 font-bold">FIND</span>
                  </button>
               </div>

               {uniqueJobTitles.length > 0 && (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-gray-400 text-sm font-medium mr-2">Suggestions</span>
                      {uniqueJobTitles.map((tag, i) => (
                        <button 
                          key={i} 
                          onClick={() => setSearchTerm(tag)}
                          className={`px-5 py-2 rounded-xl text-xs font-bold transition ${searchTerm === tag ? 'bg-[#2b1c55] text-white shadow-md' : 'bg-gray-100 text-purple-900 hover:bg-purple-100'}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                </div>
               )}

               {jobs.length === 0 && (
                   <div className="text-center py-20 text-gray-400">
                       <p className="text-lg">No jobs available at the moment.</p>
                       <p className="text-xs mt-2">Please check back later for new opportunities.</p>
                   </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                 {filteredJobs.map((job, idx) => {
                   const colors = ['bg-blue-500', 'bg-orange-500', 'bg-purple-500', 'bg-green-500'];
                   const iconBg = colors[idx % colors.length];
                   return (
                     <div key={job.id} onClick={() => handleJobClick(job)} className="bg-white p-7 rounded-[2rem] shadow-sm hover:shadow-xl transition-shadow cursor-pointer flex flex-col h-full border border-gray-100 group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-600 opacity-0 group-hover:opacity-100 transition"></div>
                        <div className="flex justify-between items-start mb-6">
                           <div>
                              <div className="text-gray-500 font-medium text-sm mb-1">{job.company}</div>
                              <h4 className="text-xl font-bold text-gray-900 leading-tight group-hover:text-purple-700 transition">{job.title}</h4>
                           </div>
                           <div className={`w-12 h-12 ${iconBg} rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg`}>
                              {job.company[0]}
                           </div>
                        </div>
                        <div className="mb-6">
                          <span className="text-purple-700 font-bold text-sm bg-purple-50 px-3 py-1 rounded-lg">{job.salaryRange}</span>
                        </div>
                        <p className="text-gray-400 text-sm leading-relaxed line-clamp-3 mb-6 flex-1">{job.description}</p>
                        
                        <div className="mt-auto pt-4">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleApplyClick(job); }}
                                className="w-full py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition shadow-lg flex items-center justify-center gap-2"
                            >
                                Apply Now <Icons.Send className="w-4 h-4" />
                            </button>
                        </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}

           {/* PRACTICE */}
           {activeTab === 'practice' && (
             <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-gray-50 border border-gray-100 p-8 rounded-[2rem] shadow-sm">
                   <h2 className="text-2xl font-bold mb-4">Practice Interview</h2>
                   <p className="text-gray-500 mb-6">Paste a job description below and upload your CV (optional) to simulate a real interview with Warren. He will scan your details and ask relevant questions.</p>
                   
                   <div className="space-y-4">
                      <div>
                         <label className="block text-sm font-bold text-gray-700 mb-2">Job Description</label>
                         <textarea 
                           className="w-full p-4 bg-white rounded-xl border border-gray-200 h-48 focus:ring-2 focus:ring-primary/50 transition" 
                           placeholder="Paste text from Indeed, LinkedIn, or any job board..."
                           value={practiceJD}
                           onChange={(e) => setPracticeJD(e.target.value)}
                         ></textarea>
                      </div>

                      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 shadow-sm border border-gray-100">
                               <Icons.Upload />
                            </div>
                            <div>
                               <div className="font-bold text-sm text-gray-700">Attach Resume for Context</div>
                               <div className="text-xs text-gray-400">{currentUser?.resumeName || "No file selected"}</div>
                            </div>
                         </div>
                         <label className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold cursor-pointer hover:bg-gray-800 transition">
                            Upload CV
                            <input type="file" className="hidden" accept=".pdf" onChange={(e) => e.target.files?.[0] && handlePracticeResumeUpload(e.target.files[0])} />
                         </label>
                      </div>

                      <button 
                        onClick={startPracticeInterview}
                        className="w-full bg-[#2b1c55] text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-black transition flex items-center justify-center gap-2"
                      >
                         <Icons.Play /> Start Simulation
                      </button>
                   </div>
                </div>
             </div>
           )}

           {/* RECRUITER DASHBOARD */}
           {activeTab === 'dashboard' && currentUser?.role === UserRole.RECRUITER && (
             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="bg-[#2b1c55] text-white p-8 rounded-[2rem] shadow-xl relative overflow-hidden">
                      <div className="absolute right-0 top-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-10 -mt-10"></div>
                      <div className="relative z-10">
                        <div className="text-white/70 font-bold text-sm uppercase tracking-wider mb-2">Active Jobs</div>
                        <div className="text-5xl font-black">{jobs.filter(j => j.postedBy === currentUser.id).length}</div>
                        <button onClick={() => { setJobForm(getInitialJobForm()); setActiveTab('post_job'); }} className="mt-6 bg-primary text-black px-6 py-2 rounded-xl text-sm font-bold hover:bg-white hover:text-black transition">Post New Job</button>
                      </div>
                   </div>
                   <div className="bg-gray-50 border border-gray-100 p-8 rounded-[2rem] shadow-sm">
                      <div className="text-gray-400 font-bold text-sm uppercase tracking-wider mb-2">Total Applicants</div>
                      <div className="text-5xl font-black text-gray-900">{allRecruiterApps.length}</div>
                   </div>
                </div>

                <div className="bg-gray-50 rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden p-6">
                   <h3 className="text-xl font-bold text-gray-900 mb-6">Manage Applications</h3>
                   
                   <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
                      <button onClick={() => setRecruiterFilterMode('NEW')} className={`px-5 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${recruiterFilterMode === 'NEW' ? 'bg-primary text-black shadow-md' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200'}`}>Ready to Review</button>
                      <button onClick={() => setRecruiterFilterMode('PENDING')} className={`px-5 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${recruiterFilterMode === 'PENDING' ? 'bg-blue-100 text-blue-700 shadow-md' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200'}`}>Pending</button>
                      <button onClick={() => setRecruiterFilterMode('INVITED')} className={`px-5 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${recruiterFilterMode === 'INVITED' ? 'bg-green-100 text-green-700 shadow-md' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200'}`}>Invited</button>
                      <button onClick={() => setRecruiterFilterMode('REJECTED')} className={`px-5 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${recruiterFilterMode === 'REJECTED' ? 'bg-red-100 text-red-700 shadow-md' : 'bg-white text-gray-500 hover:bg-gray-200 border border-gray-200'}`}>Rejected</button>
                   </div>

                   <div className="space-y-4">
                     {displayApps.map(app => {
                       const u = users.find(user => user.id === app.userId);
                       const j = jobs.find(job => job.id === app.jobId);
                       if (!u || !j) return null;
                       return (
                         <div key={app.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white rounded-2xl hover:bg-purple-50 transition cursor-pointer gap-4 border border-gray-100" onClick={() => handleReviewClick(app)}>
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 bg-black text-primary rounded-xl flex items-center justify-center font-bold text-lg">{u.name[0]}</div>
                               <div>
                                  <div className="font-bold text-gray-900">{u.name}</div>
                                  <div className="text-xs text-gray-500">{j.title}</div>
                               </div>
                            </div>
                            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                               <div className="text-right">
                                  <div className="text-xs text-gray-400 uppercase font-bold">Match</div>
                                  <div className={`text-lg font-black ${app.matchScore >= 75 ? 'text-green-600' : app.matchScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{app.matchScore}%</div>
                               </div>
                               <button className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:text-black hover:border-black transition">Review</button>
                            </div>
                         </div>
                       )
                     })}
                     {displayApps.length === 0 && <div className="text-center py-10 text-gray-400">No applications found in this category.</div>}
                   </div>
                </div>
             </div>
           )}

           {/* POST JOB */}
           {activeTab === 'post_job' && currentUser?.role === UserRole.RECRUITER && (
             <div className="max-w-3xl mx-auto bg-gray-50 border border-gray-100 p-8 rounded-[2rem] shadow-sm">
                <h2 className="text-2xl font-bold mb-6">Create New Job Listing</h2>
                <div className="space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                         <label className="block text-sm font-bold text-gray-700 mb-2">Job Title</label>
                         <input type="text" autoComplete="off" className="w-full p-3 bg-white rounded-xl border border-gray-200" value={jobForm.title} onChange={e => setJobForm({...jobForm, title: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-sm font-bold text-gray-700 mb-2">Company</label>
                         <input type="text" autoComplete="off" className="w-full p-3 bg-white rounded-xl border border-gray-200" value={jobForm.company} onChange={e => setJobForm({...jobForm, company: e.target.value})} />
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                         <label className="block text-sm font-bold text-gray-700 mb-2">Location</label>
                         <input type="text" autoComplete="off" className="w-full p-3 bg-white rounded-xl border border-gray-200" value={jobForm.location} onChange={e => setJobForm({...jobForm, location: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-sm font-bold text-gray-700 mb-2">Type</label>
                         <select className="w-full p-3 bg-white rounded-xl border border-gray-200" value={jobForm.type} onChange={e => setJobForm({...jobForm, type: e.target.value})}>
                            <option>Full-time</option>
                            <option>Part-time</option>
                            <option>Contract</option>
                            <option>Freelance</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-sm font-bold text-gray-700 mb-2">Salary Range</label>
                         <input type="text" autoComplete="off" className="w-full p-3 bg-white rounded-xl border border-gray-200" placeholder="e.g. $50k - $70k" value={jobForm.salary} onChange={e => setJobForm({...jobForm, salary: e.target.value})} />
                      </div>
                   </div>

                   <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                      <label className="block text-sm font-bold text-purple-900 mb-2">Interview Configuration</label>
                      <p className="text-xs text-gray-500 mb-3">Choose how you want applicants to be interviewed by Warren (AI Recruiter).</p>
                      <select 
                         className="w-full p-3 bg-white rounded-xl border border-purple-200" 
                         value={jobForm.interviewSetting} 
                         onChange={e => setJobForm({...jobForm, interviewSetting: e.target.value})}
                      >
                         <option value="OPEN">Candidate's Choice (Text, Voice, or Video)</option>
                         <option value="CHAT">Force Text Chat Only</option>
                         <option value="VOICE">Force Voice Only</option>
                         <option value="VIDEO">Force Video Interview</option>
                      </select>
                   </div>

                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                      <textarea className="w-full p-3 bg-white rounded-xl border border-gray-200 h-32" value={jobForm.desc} onChange={e => setJobForm({...jobForm, desc: e.target.value})}></textarea>
                   </div>
                   
                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Requirements (comma separated)</label>
                      <input type="text" autoComplete="off" className="w-full p-3 bg-white rounded-xl border border-gray-200" placeholder="React, Node.js, 3+ years exp..." value={jobForm.reqs} onChange={e => setJobForm({...jobForm, reqs: e.target.value})} />
                   </div>

                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Screening Questions (comma separated)</label>
                      <input type="text" autoComplete="off" className="w-full p-3 bg-white rounded-xl border border-gray-200" placeholder="Years of experience with React?, Are you willing to relocate?..." value={jobForm.questions} onChange={e => setJobForm({...jobForm, questions: e.target.value})} />
                   </div>

                   <button onClick={handlePostJob} className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 transition shadow-lg mt-4">Post Job Now</button>
                </div>
             </div>
           )}
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* Practice Results */}
      {showPracticeResults && practiceFeedback && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-scale-up">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl relative">
               <button onClick={() => setShowPracticeResults(false)} className="absolute top-6 right-6 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:text-black">✕</button>
               
               <h2 className="text-3xl font-bold mb-2">Practice Session Complete</h2>
               <p className="text-gray-500 mb-8">Here is how you performed in your simulated interview with Warren.</p>

               <div className="space-y-6">
                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                     <h3 className="font-bold text-blue-900 text-lg mb-3">Candidate Feedback</h3>
                     <div className="prose text-blue-800 text-sm whitespace-pre-wrap leading-relaxed">{practiceFeedback.candidate}</div>
                  </div>

                  <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
                     <h3 className="font-bold text-purple-900 text-lg mb-3 flex items-center gap-2">
                        <Icons.User className="w-5 h-5"/> Recruiter's Perspective
                     </h3>
                     <p className="text-xs uppercase font-bold text-purple-400 mb-2">What the hiring manager would see:</p>
                     <div className="prose text-purple-900 text-sm whitespace-pre-wrap leading-relaxed">{practiceFeedback.recruiter}</div>
                  </div>
               </div>
               
               <div className="mt-8 flex justify-end">
                  <button onClick={() => setShowPracticeResults(false)} className="bg-black text-white px-8 py-3 rounded-xl font-bold">Close Analysis</button>
               </div>
            </div>
         </div>
      )}
      
      {/* Review Application */}
      {reviewApp && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
               <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                  <h2 className="text-2xl font-bold">Application Review</h2>
                  <button onClick={() => setReviewApp(null)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-500 hover:text-black shadow-sm">✕</button>
               </div>
               <div className="p-8 overflow-y-auto space-y-6">
                  <div className="flex flex-col md:flex-row items-center gap-6">
                     <div className="w-20 h-20 bg-black text-primary rounded-2xl flex items-center justify-center text-3xl font-bold overflow-hidden">
                        {(() => {
                           const u = users.find(u=>u.id===reviewApp.userId);
                           return u?.avatar ? <img src={u.avatar} className="w-full h-full object-cover"/> : u?.name[0];
                        })()}
                     </div>
                     <div className="text-center md:text-left flex-1">
                        <h3 className="text-2xl font-bold text-gray-900">{users.find(u=>u.id===reviewApp.userId)?.name}</h3>
                        <p className="text-gray-500 mb-2">{users.find(u=>u.id===reviewApp.userId)?.email}</p>
                     </div>
                     <div className="md:ml-auto text-right">
                        <div className="text-sm font-bold text-gray-400 uppercase">Match Score</div>
                        <div className={`text-4xl font-black ${reviewApp.matchScore >= 75 ? 'text-green-600' : reviewApp.matchScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{reviewApp.matchScore}%</div>
                     </div>
                  </div>
                  
                  {/* Contact Info & CV */}
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col md:flex-row justify-between gap-6">
                     <div className="space-y-2">
                        <h4 className="font-bold text-gray-900 text-sm uppercase">Contact Information</h4>
                        {(() => {
                             const u = users.find(u=>u.id===reviewApp.userId);
                             return (
                                 <div className="text-sm text-gray-600">
                                     <div className="flex items-center gap-2"><Icons.User className="w-4 h-4"/> {u?.phone || 'No phone provided'}</div>
                                     <div className="flex items-center gap-2 mt-1"><Icons.List className="w-4 h-4"/> {u?.address || 'No address provided'}</div>
                                 </div>
                             )
                        })()}
                     </div>
                     {(() => {
                         const u = users.find(u=>u.id===reviewApp.userId);
                         if (u?.resume) {
                             return (
                                 <button 
                                    onClick={() => downloadResume(u.resume!, u.resumeName || 'resume.pdf')}
                                    className="px-6 py-3 bg-white border-2 border-black text-black font-bold rounded-xl hover:bg-black hover:text-white transition flex items-center gap-2 self-start"
                                 >
                                    <Icons.Upload className="w-4 h-4 rotate-180" /> Download CV
                                 </button>
                             );
                         }
                         return null;
                     })()}
                  </div>

                  <div className="flex gap-4">
                     <button 
                        onClick={() => {
                           setComposeData({ toId: reviewApp.userId, subject: `Regarding your application for ${jobs.find(j=>j.id===reviewApp.jobId)?.title}`, content: '' });
                           setIsComposeOpen(true);
                        }}
                        className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-700 hover:bg-gray-200"
                     >
                        Message Candidate
                     </button>
                  </div>
                  
                  {/* Interview Data */}
                  {reviewApp.transcript && (
                     <div className="space-y-6">
                        {reviewApp.interviewSummary && (
                           <div className="bg-green-50 p-6 rounded-2xl border border-green-100 shadow-sm">
                              <h4 className="font-bold text-green-900 mb-3 flex items-center gap-2">
                                 <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center text-green-700">✓</div>
                                 AI Interview Summary
                              </h4>
                              <div className="text-green-800 text-sm leading-relaxed whitespace-pre-wrap">{reviewApp.interviewSummary}</div>
                           </div>
                        )}

                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                           <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                              Interview Recording / Transcript
                           </h4>
                           
                           {reviewApp.recordingData ? (
                              <div className="mb-6">
                                 {reviewApp.recordingType?.includes('video') ? (
                                    <video src={reviewApp.recordingData} controls className="w-full rounded-xl shadow-md border border-gray-200" />
                                 ) : (
                                    <audio src={reviewApp.recordingData} controls className="w-full" />
                                 )}
                                 <p className="text-xs text-gray-500 mt-2 font-medium flex items-center gap-1">
                                    <span className="w-2 h-2 bg-red-500 rounded-full"></span> 
                                    {reviewApp.recordingType?.includes('video') ? 'Video Interview Recorded' : 'Voice Interview Recorded'}
                                 </p>
                              </div>
                           ) : reviewApp.interviewMode !== InterviewMode.CHAT && (
                              <div className="mb-4 text-xs text-amber-600 font-bold bg-amber-50 p-2 rounded border border-amber-200">
                                 No media recording available for this session.
                              </div>
                           )}

                           <div className="max-h-60 overflow-y-auto space-y-2 p-3 bg-white rounded-xl border border-gray-200">
                              {reviewApp.transcript.map((msg, i) => (
                                 <div key={i} className="text-sm">
                                    <span className="font-bold">{msg.role === 'model' ? 'Warren' : 'Candidate'}:</span> {msg.text}
                                 </div>
                              ))}
                           </div>
                        </div>
                     </div>
                  )}

                  <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                     <h4 className="font-bold text-blue-900 mb-2">CV AI Analysis</h4>
                     <p className="text-blue-800 leading-relaxed">{reviewApp.aiAnalysis}</p>
                  </div>
               </div>
               
               {/* Decision Buttons */}
               {reviewApp.status !== ApplicationStatus.REJECTED && reviewApp.status !== ApplicationStatus.FINAL_INVITE_SENT && (
                  <div className="p-6 border-t border-gray-100 flex gap-4 bg-gray-50 shrink-0">
                     <button className="flex-1 py-4 rounded-2xl border-2 border-red-100 text-red-600 font-bold hover:bg-red-50" onClick={handleRejectApplication}>Reject Application</button>
                     <button className="flex-1 py-4 rounded-2xl bg-[#2b1c55] text-white font-bold hover:bg-black shadow-lg" onClick={() => setInviteModalOpen(true)}>Invite to Final</button>
                  </div>
               )}
            </div>
         </div>
      )}

      {/* Alert Modal */}
      {alertState.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-[2rem] w-full max-w-sm p-6 shadow-2xl relative flex flex-col items-center text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              alertState.type === 'success' ? 'bg-green-100 text-green-600' :
              alertState.type === 'error' ? 'bg-red-100 text-red-600' :
              alertState.type === 'warning' ? 'bg-amber-100 text-amber-600' :
              'bg-blue-100 text-blue-600'
            }`}>
              {alertState.type === 'success' ? <Icons.Check /> : 
               alertState.type === 'error' ? <Icons.X /> : 
               alertState.type === 'warning' ? <Icons.Alert /> : <Icons.Info />}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{alertState.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">{alertState.message}</p>
            <button onClick={closeAlert} className="w-full py-3 rounded-xl font-bold text-white bg-black hover:bg-gray-800">Okay, Got it</button>
          </div>
        </div>
      )}

      {/* Apply Modal (Only shown over Detail Page now) */}
      {showApplyModal && selectedJob && currentUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl">
              <h3 className="text-2xl font-bold mb-2">Review Application</h3>
              <div className="bg-gray-50 p-6 rounded-2xl mb-6 border border-gray-200">
                 <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-gray-700">Attached Resume</span>
                    <label className="text-primary text-xs font-bold cursor-pointer hover:text-black">Change <input type="file" className="hidden" accept=".pdf" onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], (base64, name) => confirmApplication(base64, name)); }} /></label>
                 </div>
                 <span className="text-sm font-medium text-gray-600 truncate">{currentUser.resumeName || "No Resume"}</span>
              </div>
              <div className="flex gap-4">
                 <button onClick={() => setShowApplyModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600">Cancel</button>
                 <button onClick={() => confirmApplication()} className="flex-1 py-3 bg-black text-white rounded-xl font-bold shadow-lg">Submit</button>
              </div>
           </div>
        </div>
      )}
      
      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl">
              <h3 className="text-2xl font-bold mb-6">Final Interview Details</h3>
              <div className="space-y-4">
                 <select className="w-full p-3 bg-gray-50 rounded-xl" value={inviteForm.type} onChange={e => setInviteForm({...inviteForm, type: e.target.value})}><option>Virtual</option><option>In-Person</option></select>
                 <input type="date" className="w-full p-3 bg-gray-50 rounded-xl" value={inviteForm.date} onChange={e => setInviteForm({...inviteForm, date: e.target.value})} />
                 <input type="time" className="w-full p-3 bg-gray-50 rounded-xl" value={inviteForm.time} onChange={e => setInviteForm({...inviteForm, time: e.target.value})} />
                 <input type="text" className="w-full p-3 bg-gray-50 rounded-xl" placeholder="Link/Location" value={inviteForm.location} onChange={e => setInviteForm({...inviteForm, location: e.target.value})} />
                 <div className="flex gap-3 mt-6">
                    <button onClick={() => setInviteModalOpen(false)} className="flex-1 py-3 border border-gray-200 font-bold">Cancel</button>
                    <button onClick={sendFinalInvite} className="flex-1 py-3 bg-black text-white font-bold">Send</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Compose Message */}
      {isComposeOpen && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl">
               <h3 className="text-xl font-bold mb-4">Send Message</h3>
               <div className="space-y-4">
                  <input type="text" className="w-full p-3 bg-gray-50 rounded-xl" placeholder="Subject" value={composeData.subject} onChange={e => setComposeData({...composeData, subject: e.target.value})} />
                  <textarea className="w-full p-3 bg-gray-50 rounded-xl h-32" placeholder="Message..." value={composeData.content} onChange={e => setComposeData({...composeData, content: e.target.value})}></textarea>
                  <div className="flex gap-3">
                     <button onClick={() => setIsComposeOpen(false)} className="flex-1 py-3 border border-gray-200 font-bold">Cancel</button>
                     <button onClick={() => handleSendMessage(composeData.toId, composeData.subject, composeData.content)} className="flex-1 py-3 bg-primary text-black font-bold">Send</button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {interviewJob && currentUser && (
        <InterviewModal 
          isOpen={isInterviewOpen}
          onClose={() => setIsInterviewOpen(false)}
          onComplete={handleInterviewComplete}
          job={interviewJob}
          user={currentUser}
        />
      )}

    </div>
  );
};

export default App;