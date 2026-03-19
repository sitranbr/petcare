import { supabase } from '../lib/supabase';

export const uploadFile = async (
  file: File, 
  bucket: string, 
  path: string
): Promise<string | null> => {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${path}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return null;
    }

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Unexpected error uploading file:', error);
    return null;
  }
};

export const uploadBase64Image = async (
  base64Data: string,
  bucket: string,
  path: string
): Promise<string | null> => {
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const file = new File([blob], "image.png", { type: "image/png" });
    return await uploadFile(file, bucket, path);
  } catch (error) {
    console.error('Error converting base64 to file:', error);
    return null;
  }
};
