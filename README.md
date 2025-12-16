# JobFinder AI

JobFinder AI is a modern, full-stack recruitment platform designed to streamline the initial screening process. By leveraging the Google Gemini Multimodal and Live APIs, the application facilitates intelligent candidate-job matching and conducts automated, conversational interviews (Text, Voice, and Video) via a persona named "Warren".

## Core Features

*   **Smart Matching:** Analysis of candidate profiles (including PDF resumes) against job descriptions to generate a compatibility score.
*   **"Warren" AI Recruiter:** An autonomous agent capable of conducting real-time technical interviews.
    *   **Live API Integration:** Low-latency voice and video interactions.
    *   **Context Awareness:** Generates questions based on the specific conversation history and candidate background.
*   **Role-Based Dashboards:** Distinct workflows for Candidates (Search, Apply, Interview) and Recruiters (Post Jobs, Review Candidates, Analytics).
*   **Real-time Notifications:** Application updates and interview invites delivered instantly.

## Tech Stack

*   **Frontend:** React 19, TypeScript, Tailwind CSS
*   **Backend:** Node.js, Express
*   **Database:** MongoDB (Mongoose)
*   **AI/ML:** Google GenAI SDK (Gemini 2.5 Flash, Gemini Live)
*   **Communication:** WebRTC (Live API), Nodemailer (Email services)

## Developer Notes

I built this project to address the bottleneck in high-volume recruitment: the initial screen. Traditional keyword matching misses context, and scheduling human screening calls is a logistical nightmare.

The most challenging aspect was implementing the `LiveInterviewSession` class (`services/gemini.ts`). Synchronizing the browser's `AudioContext` with the raw PCM stream from the Gemini Live API required a custom buffering strategy to ensure "Warren" didn't stutter during network fluctuations.

Future updates will focus on:
1.  Reducing latency in the video processing pipeline.
2.  Adding multi-language support for international recruitment.

## Setup

1.  **Environment Variables:** Create a `.env` file with your `API_KEY` (Google GenAI), `MONGO_URI`, and email credentials.
2.  **Install:** `npm install`
3.  **Run:** `npm start` (Runs both client and server via concurrently or similar setup).

---
*Developed by Zibeke Onwabe*
