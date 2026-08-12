# Replace landing-page hero image with a "Meraki"-themed visual

## Goal
Swap the current hero classroom photo on `/` for an image that matches the site name "Meraki" (Greek for doing something with soul, creativity, and passion). The new image should feel soulful, alive, and include flowing wisps or energetic motion.

## Steps
1. Generate a new hero image using the agent image-generation tool.
   - Prompt: an inspiring, soulful education-themed scene with warm light, flowing ethereal wisps, and a sense of passion/aliveness; avoid text.
   - Save to `src/assets/hero-classroom.jpg` (overwrite) or create a new asset and update the import.
2. Update `src/routes/index.tsx` if the image filename/import changes.
3. Verify the landing page preview renders the new image in the hero section.

## Outcome
The homepage hero visually communicates the meaning of "Meraki" while keeping the existing layout and copy intact.
