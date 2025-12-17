
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config();

const app = express();

// Middleware: Increase limit to 50mb to support large Base64 resume/audio uploads
app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// Root Route: API Health Check
app.get('/', (req, res) => {
  res.json({ 
    message: "JobFinder API Connected", 
    status: "OK",
    timestamp: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 5000;
// Use 127.0.0.1 to prevent IPv6 resolution errors on some local environments
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/jobfinder';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

// Database Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

/* -------------------------------------------------------------------------- */
/*                                   Schemas                                  */
/* -------------------------------------------------------------------------- */

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['CANDIDATE', 'RECRUITER'], default: 'CANDIDATE' },
  verified: { type: Boolean, default: false },
  otp: String,
  
  // Extended Profile Fields
  title: String,
  phone: String,
  address: String,
  summary: String,
  company: String,
  website: String,
  skills: [mongoose.Schema.Types.Mixed], 
  experience: [mongoose.Schema.Types.Mixed],
  education: [mongoose.Schema.Types.Mixed],
  avatar: String,
  resume: String, // Base64 encoded file
  resumeName: String
});

const JobSchema = new mongoose.Schema({
  title: String,
  company: String,
  location: String,
  type: String,
  salaryRange: String,
  description: String,
  requirements: [String],
  questions: [String],
  interviewSetting: String,
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

const ApplicationSchema = new mongoose.Schema({
  jobId: String,
  userId: String,
  status: String,
  matchScore: Number,
  aiAnalysis: String,
  interviewSummary: String,
  transcript: [mongoose.Schema.Types.Mixed],
  recordingData: String,
  recordingType: String,
  appliedDate: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  userId: String,
  title: String,
  message: String,
  type: String,
  read: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  fromId: { type: String, required: true },
  toId: { type: String, required: true },
  fromName: String,
  subject: String,
  content: String,
  read: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  isAi: { type: Boolean, default: false }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Job = mongoose.models.Job || mongoose.model('Job', JobSchema);
const Application = mongoose.models.Application || mongoose.model('Application', ApplicationSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

/* -------------------------------------------------------------------------- */
/*                               Email Service                                */
/* -------------------------------------------------------------------------- */

// Global Transporter Setup (Matches your working example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS 
  }
});

// Removed explicit verification to prevent cold-start timeouts on platforms like Render.
// If credentials are wrong, it will fail when trying to send an email, which is safer.

const sendEmail = async ({ to, subject, html, cc }) => {
  try {
    const mailOptions = {
      from: `"JobFinder Security" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    };

    if (cc) mailOptions.cc = cc;

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent successfully to ${to}`);
  } catch (error) {
    console.error(`[Email Error] Failed to send to ${to}:`, error.message);
  }
};

const styles = {
  header: 'background-color: #000000; padding: 30px; text-align: center;',
  title: 'color: #FDB913; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;',
  footer: 'background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eeeeee;',
  otpBox: 'background-color: #f8f9fa; border-left: 6px solid #FDB913; padding: 20px; margin: 30px 0; text-align: center; border-radius: 4px;'
};

const wrapEmail = (body) => `
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; background-color: #ffffff;">
    <div style="${styles.header}"><h1 style="${styles.title}">JobFinder<span style="color: #ffffff;">.</span></h1></div>
    ${body}
    <div style="${styles.footer}"><p style="color: #999999; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} JobFinder AI.</p></div>
  </div>
`;

const templates = {
  otp: (otp, type) => `
    <div style="padding: 40px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">${type === 'Verification' ? 'Verify Account' : 'Reset Password'}</h2>
      <div style="${styles.otpBox}">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #000;">${otp}</span>
      </div>
    </div>`,
  
  invite: (d) => `
    <div style="padding: 40px;">
      <h2>Final Interview Invitation</h2>
      <p>We are inviting you to the final interview for <strong>${d.jobTitle}</strong> at <strong>${d.company}</strong>.</p>
      <ul><li>${d.type}</li><li>${d.date} at ${d.time}</li><li>${d.location}</li></ul>
    </div>`,
    
  feedback: (job, text) => `
    <div style="padding: 40px;">
      <h2>AI Interview Feedback: ${job}</h2>
      <div style="background-color: #fff9e6; border-left: 6px solid #FDB913; padding: 20px;">${text}</div>
    </div>`
};

/* -------------------------------------------------------------------------- */
/*                                API Endpoints                               */
/* -------------------------------------------------------------------------- */

// --- User Routes ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({});
    // Remove sensitive fields
    res.json(users.map(u => ({ ...u.toObject(), id: u._id, _id: undefined, password: undefined })));
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ...updated.toObject(), id: updated._id, _id: undefined, password: undefined });
  } catch(e) { res.status(500).json({error: e.message}); }
});

// --- Job Routes ---
app.get('/api/jobs', async (req, res) => {
    const jobs = await Job.find({});
    res.json(jobs.map(j => ({ ...j.toObject(), id: j._id, _id: undefined })));
});

app.post('/api/jobs', async (req, res) => {
    const job = new Job(req.body);
    await job.save();
    res.status(201).json({ ...job.toObject(), id: job._id, _id: undefined });
});

// --- Application Routes ---
app.get('/api/applications', async (req, res) => {
    const apps = await Application.find({});
    res.json(apps.map(a => ({ ...a.toObject(), id: a._id, _id: undefined })));
});

app.post('/api/applications', async (req, res) => {
    const app = new Application(req.body);
    await app.save();
    res.status(201).json({ ...app.toObject(), id: app._id, _id: undefined });
});

app.put('/api/applications/:id', async (req, res) => {
    const updated = await Application.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ...updated.toObject(), id: updated._id, _id: undefined });
});

// --- Notification Routes ---
app.get('/api/notifications/:userId', async (req, res) => {
    const notes = await Notification.find({ userId: req.params.userId });
    res.json(notes.map(n => ({ ...n.toObject(), id: n._id, _id: undefined })));
});

app.post('/api/notifications', async (req, res) => {
    const note = new Notification(req.body);
    await note.save();
    res.status(201).json({ ...note.toObject(), id: note._id, _id: undefined });
});

app.put('/api/notifications/:id/read', async (req, res) => {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
});

app.put('/api/notifications/read-all', async (req, res) => {
    await Notification.updateMany({ userId: req.body.userId }, { read: true });
    res.json({ success: true });
});

// --- Authentication Routes ---
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, ...profileData } = req.body;
  
  try {
    if (await User.findOne({ email })) {
        return res.status(400).json({ message: 'User exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Create user first
    const newUser = new User({ name, email, password: hashedPassword, role, otp, verified: false, ...profileData });
    await newUser.save();
    
    // Send email using helper
    await sendEmail({ 
        to: email, 
        subject: `Verify Account`, 
        html: wrapEmail(templates.otp(otp, 'Verification')) 
    });
    
    res.status(201).json({ message: 'Registered' });
  } catch (err) { 
      // If basic validation or DB error, clean up
      if(err.code === 'EAUTH' || err.responseCode === 535) {
         await User.findOneAndDelete({ email });
      }
      console.error(err);
      res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });
  
  if (!user || user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
  
  user.verified = true; 
  user.otp = undefined;
  await user.save();
  
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user: { ...user.toObject(), id: user._id, _id: undefined, password: undefined } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  
  if (!user || !user.verified) return res.status(404).json({ message: 'User not found or unverified' });
  if (!(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: 'Invalid credentials' });
  
  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user: { ...user.toObject(), id: user._id, _id: undefined, password: undefined } });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otp = otp;
  await user.save();

  await sendEmail({ 
      to: email, 
      subject: `Reset Password`, 
      html: wrapEmail(templates.otp(otp, 'Reset Password')) 
  });
  
  res.json({ message: 'OTP sent' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  
  if (!user || user.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
  
  user.password = await bcrypt.hash(newPassword, 10);
  user.otp = undefined;
  await user.save();
  
  res.json({ message: 'Password updated' });
});

// --- Recruiting Routes ---
app.post('/api/recruit/invite', async (req, res) => {
  const { applicantId, jobTitle, company, ...details } = req.body;
  const user = await User.findById(applicantId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  
  await sendEmail({
    to: user.email,
    cc: process.env.EMAIL_USER, 
    subject: `Interview: ${jobTitle}`,
    html: wrapEmail(templates.invite({ jobTitle, company, ...details }))
  });
  
  res.json({ message: 'Sent' });
});

app.post('/api/recruit/reject', async (req, res) => {
    const { applicantId, jobTitle, company } = req.body;
    const user = await User.findById(applicantId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await sendEmail({
        to: user.email,
        subject: `Update on your application: ${jobTitle}`,
        html: wrapEmail(`
            <div style="padding: 40px;">
                <h2>Application Update</h2>
                <p>Thank you for your interest in the <strong>${jobTitle}</strong> position at <strong>${company}</strong>.</p>
                <p>After careful consideration, we have decided to move forward with other candidates who more closely match our current requirements.</p>
                <p>We wish you the best in your job search.</p>
            </div>
        `)
    });
    
    res.json({ message: 'Rejection sent' });
});

app.post('/api/interview/feedback', async (req, res) => {
  const { applicantId, jobTitle, feedback } = req.body;
  const user = await User.findById(applicantId);
  
  await sendEmail({
    to: user.email,
    subject: `Interview Feedback: ${jobTitle}`,
    html: wrapEmail(templates.feedback(jobTitle, feedback))
  });
  
  res.json({ message: 'Sent' });
});

app.post('/api/interview/notify-recruiter', async (req, res) => {
    const { recruiterId, applicantName, jobTitle, summary } = req.body;
    const recruiter = await User.findById(recruiterId);
    if(recruiter) {
        await sendEmail({
            to: recruiter.email,
            subject: `Candidate Interviewed: ${applicantName}`,
            html: wrapEmail(`
                <div style="padding: 40px;">
                    <h2>Interview Completed</h2>
                    <p><strong>${applicantName}</strong> has completed their AI interview for <strong>${jobTitle}</strong>.</p>
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin-top: 20px;">
                        <strong>AI Summary:</strong><br/>
                        ${summary.replace(/\n/g, '<br/>')}
                    </div>
                    <p><a href="https://jobfinder-ai.onrender.com">Login to review full transcript</a></p>
                </div>
            `)
        });
    }
    res.json({ success: true });
});

// --- Message Routes ---
app.get('/api/messages/:userId', async (req, res) => {
    try {
        const messages = await Message.find({ $or: [{ toId: req.params.userId }, { fromId: req.params.userId }] }).sort({ date: -1 });
        res.json(messages.map(m => ({ ...m.toObject(), id: m._id, _id: undefined })));
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/messages', async (req, res) => {
    try {
        const msg = new Message(req.body);
        await msg.save();
        res.status(201).json({ ...msg.toObject(), id: msg._id, _id: undefined });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.put('/api/messages/:id/read', async (req, res) => {
    try {
        await Message.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));