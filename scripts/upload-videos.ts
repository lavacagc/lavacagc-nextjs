import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadVideos() {
  const videosDir = path.join(process.cwd(), 'public/videos');
  const videoFiles = fs.readdirSync(videosDir).filter(file => file.endsWith('.mp4'));

  console.log(`Found ${videoFiles.length} videos to upload`);

  for (const videoFile of videoFiles) {
    const filePath = path.join(videosDir, videoFile);
    const fileBuffer = fs.readFileSync(filePath);

    console.log(`Uploading ${videoFile}...`);

    const { data, error } = await supabase.storage
      .from('hero-videos')
      .upload(videoFile, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (error) {
      console.error(`Error uploading ${videoFile}:`, error);
    } else {
      console.log(`✓ Uploaded ${videoFile}`);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('hero-videos')
        .getPublicUrl(videoFile);

      console.log(`  Public URL: ${publicUrl}`);
    }
  }

  console.log('\nAll videos uploaded!');
}

uploadVideos().catch(console.error);
