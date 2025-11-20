import type { VercelRequest, VercelResponse } from "../../src/types/vercel";
import { handleCors, jsonResponse, errorResponse } from "../../src/api/utils";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function parseMultipartFormData(req: VercelRequest): Promise<{ audio: Buffer; filename: string; mimeType: string } | null> {
  const chunks: Buffer[] = [];
  
  return new Promise((resolve, reject) => {
    req.on("data", (chunk: unknown) => {
      if (chunk instanceof Buffer) {
        chunks.push(chunk);
      }
    });
    
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers["content-type"];
        const contentTypeStr = Array.isArray(contentType) ? contentType[0] : contentType || "";
        const boundary = contentTypeStr.split("boundary=")[1];
        if (!boundary) {
          resolve(null);
          return;
        }
        
        const parts = body.toString("binary").split(`--${boundary}`);
        let audioBuffer: Buffer | null = null;
        let filename = "speech.webm";
        let mimeType = "audio/webm";
        
        for (const part of parts) {
          if (part.includes("Content-Disposition: form-data")) {
            const nameMatch = part.match(/name="([^"]+)"/);
            const filenameMatch = part.match(/filename="([^"]+)"/);
            const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
            
            if (nameMatch && nameMatch[1] === "audio") {
              if (filenameMatch) {
                filename = filenameMatch[1];
              }
              if (contentTypeMatch) {
                mimeType = contentTypeMatch[1].trim();
              }
              
              const contentStart = part.indexOf("\r\n\r\n");
              if (contentStart !== -1) {
                const content = part.slice(contentStart + 4);
                const endBoundary = content.lastIndexOf(`\r\n--${boundary}`);
                const audioContent = endBoundary !== -1 ? content.slice(0, endBoundary) : content;
                audioBuffer = Buffer.from(audioContent, "binary");
              }
            }
          }
        }
        
        if (audioBuffer) {
          resolve({ audio: audioBuffer, filename, mimeType });
        } else {
          resolve(null);
        }
      } catch (error) {
        reject(error);
      }
    });
    
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    errorResponse(res, "Method not allowed", 405);
    return;
  }

  if (!OPENAI_API_KEY) {
    errorResponse(res, "OPENAI_API_KEY not configured", 503);
    return;
  }

  try {
    const formData = await parseMultipartFormData(req);
    if (!formData) {
      errorResponse(res, "audio file is required", 400);
      return;
    }

    const { audio, filename, mimeType } = formData;
    
    // Determine file extension and MIME type
    let extension = "webm";
    let finalMimeType = mimeType;
    
    if (mimeType === "audio/m4a" || mimeType === "audio/x-m4a" || mimeType === "audio/mp4") {
      extension = "m4a";
      finalMimeType = "audio/m4a";
    } else if (mimeType === "audio/caf" || mimeType === "audio/x-caf") {
      extension = "caf";
      finalMimeType = "audio/caf";
    } else if (mimeType === "audio/webm") {
      extension = "webm";
      finalMimeType = "audio/webm";
    } else {
      extension = "webm";
      finalMimeType = "audio/webm";
    }

    const openAIClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    const file = await toFile(audio, filename || `speech.${extension}`, {
      type: finalMimeType,
    });

    const transcription = await openAIClient.audio.transcriptions.create({
      file,
      model: OPENAI_TRANSCRIPTION_MODEL,
      response_format: "json",
    });

    const text = transcription.text?.trim() ?? "";
    jsonResponse(res, { status: "ok", text });
  } catch (error) {
    const maybeResponse = (error as { response?: { status?: number; statusText?: string; data?: unknown } }).response;
    if (maybeResponse) {
      console.error("[Speech] Transcription failed:", {
        status: maybeResponse.status,
        statusText: maybeResponse.statusText,
        data: maybeResponse.data,
      });
    } else {
      console.error("[Speech] Transcription failed:", error);
    }
    errorResponse(res, "Failed to transcribe audio");
  }
}

