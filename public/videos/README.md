# Hero Background Videos

## Instructions

Place your hero background videos in this folder using the naming convention below. The website will randomly select one video each time a visitor loads the homepage.

### File Naming Convention:

- `hero-background-1.mp4`
- `hero-background-2.mp4`
- `hero-background-3.mp4`
- And so on...

**Important**: After adding new videos, update the `availableVideos` array in `src/components/Hero.tsx` to include the new video paths.

### Recommended Video Specifications:

- **Format**: MP4 (H.264 codec)
- **Resolution**: 1920x1080 (Full HD) minimum
- **Aspect Ratio**: 16:9
- **Duration**: 10-30 seconds (video will loop)
- **File Size**: Keep under 10MB for optimal loading performance
- **Content**: Footage of home remodeling projects, construction work, or beautiful home interiors/exteriors

### Video Optimization Tips:

1. **Compress your video** using tools like HandBrake or online compressors to reduce file size while maintaining quality
2. **Use consistent lighting** - avoid overly bright or dark scenes that might make text hard to read
3. **Avoid rapid movements** - the video plays at 0.5x speed (slow motion) for a cinematic effect
4. **Test text legibility** - ensure your video doesn't have high-contrast areas that compete with the hero text
5. **Add variety** - Different types of projects (kitchens, bathrooms, exteriors) create a more engaging experience

### Current Configuration:

- **Random Selection**: One video selected randomly on each page load
- **Playback Speed**: 0.5x (half speed slow motion)
- **Dark Overlay**: 55% black overlay for text legibility
- **Drop Shadow**: Applied to text for additional contrast
- **Responsive**: Video displays on all device sizes

### How Random Selection Works:

Each time a visitor loads the homepage (from any IP address), the site randomly selects one video from the available videos array. Different visitors will see different videos, and the same visitor will see different videos on subsequent visits.

### Fallback Behavior:

If no videos are present or if the selected video fails to load, the hero section will display the gradient background as before. The site will continue to function normally.

---

**Example File Paths**:
- `/public/videos/hero-background-1.mp4`
- `/public/videos/hero-background-2.mp4`
- `/public/videos/hero-background-3.mp4`
