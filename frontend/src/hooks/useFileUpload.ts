import { useState } from 'react';

export interface UploadResult {
  url: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface UseFileUpload {
  upload: (file: File) => Promise<UploadResult>;
  uploading: boolean;
}

export function useFileUpload(): UseFileUpload {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File): Promise<UploadResult> => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.text();
        let errorMessage = `Upload failed (${res.status})`;
        try {
          const json = JSON.parse(body) as { message?: string };
          if (json.message) {
            errorMessage = json.message;
          }
        } catch {
          // ignore parse error
        }
        throw new Error(errorMessage);
      }

      const data = (await res.json()) as UploadResult;
      return data;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
