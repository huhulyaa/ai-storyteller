from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from kokoro import KPipeline
import soundfile as sf
import numpy as np
import os
import uuid

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("audio", exist_ok=True)
app.mount("/audio", StaticFiles(directory="audio"), name="audio")

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

pipelines = {
    "a": KPipeline(lang_code="a"),
    "b": KPipeline(lang_code="b"),
}

NARRATORS = {
    "heart": {
        "name": "Heart",
        "voice": "af_heart",
        "lang_code": "a",
        "description": "Warm female narrator",
    },
    "bella": {
        "name": "Bella",
        "voice": "af_bella",
        "lang_code": "a",
        "description": "Expressive female narrator",
    },
    "nicole": {
        "name": "Nicole",
        "voice": "af_nicole",
        "lang_code": "a",
        "description": "Calm female narrator",
    },
    "adam": {
        "name": "Adam",
        "voice": "am_adam",
        "lang_code": "a",
        "description": "Deep male narrator",
    },
    "michael": {
        "name": "Michael",
        "voice": "am_michael",
        "lang_code": "a",
        "description": "Clear male narrator",
    },
    "emma": {
        "name": "Emma",
        "voice": "bf_emma",
        "lang_code": "b",
        "description": "British female narrator",
    },
    "daniel": {
        "name": "Daniel",
        "voice": "bm_daniel",
        "lang_code": "b",
        "description": "British male narrator",
    },
}


class StoryRequest(BaseModel):
    genre: str
    length: str
    narrator: str = "heart"


@app.get("/")
def home():
    return {"message": "AI Storyteller API is running"}


@app.get("/narrators")
def get_narrators():
    return {"narrators": NARRATORS}


@app.post("/generate-story")
def generate_story(request: StoryRequest):
    try:
        narrator = NARRATORS.get(request.narrator)

        if narrator is None:
            raise HTTPException(status_code=400, detail="Invalid narrator selected.")

        prompt = f"""
Generate a {request.length} {request.genre} story.

Requirements:
- Make it engaging and suitable for narration.
- Use simple and clear English.
- Do not use markdown.
- Do not include title labels.
- Make the story complete with a beginning, middle, and ending.
"""

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": "You are a creative story writer for a text-to-speech storytelling app.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.9,
        )

        story = response.choices[0].message.content.strip()

        filename = f"{uuid.uuid4()}.wav"
        audio_path = os.path.join("audio", filename)

        pipeline = pipelines[narrator["lang_code"]]

        generator = pipeline(
            story,
            voice=narrator["voice"],
            speed=0.9,
        )

        audio_chunks = []

        for _, _, audio in generator:
            audio_chunks.append(audio)

        if not audio_chunks:
            raise Exception("No audio generated.")

        final_audio = np.concatenate(audio_chunks)
        sf.write(audio_path, final_audio, 24000)

        return {
            "genre": request.genre,
            "length": request.length,
            "narrator": narrator["name"],
            "story": story,
            "audio_url": f"http://192.168.1.8:8000/audio/{filename}",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))