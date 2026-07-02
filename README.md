# Fables

**Fables** is an AI-powered storytelling app that generates genre-based stories, converts them into natural narrator-style speech using a local TTS model, and plays matching background ambiance for a more immersive listening experience.

## Features

* Generate AI stories by genre
* Choose story length: short, medium, or long
* Select a narrator voice

## Tech Stack

### Frontend

* React Native
* Expo

### Backend

* Python
* FastAPI
* Groq API
* Kokoro TTS
* SoundFile
* NumPy

## Backend Setup

Go to the backend folder:

```bash
cd backend
```

Create a virtual environment:

```bash
py -3.12 -m venv venv
```

Activate the virtual environment:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install fastapi uvicorn python-dotenv groq kokoro soundfile numpy
```
Install dependencies.
```bash
pip install -r requirements.txt
```

Create a `.env` file:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Run the backend:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will run at:

```text
http://localhost:8000
```

For mobile testing through Expo Go, use your computer's local IP address, for example:

```text
http://YOUR_PC_IP:8000
```

## Frontend Setup

Go to the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Install Expo Audio:

```bash
npx expo install expo-audio
```

Start the Expo app:

```bash
npx expo start
```

Scan the QR code using Expo Go.

