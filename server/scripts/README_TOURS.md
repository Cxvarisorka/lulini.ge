# Tours Seed Script

This script will populate your database with 6 sample tours covering different categories.

## Sample Tours Included:

1. **Tbilisi City Walking Tour** (City Tour - Featured)
   - 4 hours, $35/person
   - Old town walking tour with wine tasting

2. **Kazbegi Mountain Adventure** (Mountain - Featured)
   - Full day, $65/person
   - Gergeti Trinity Church and mountain views

3. **Kakheti Wine Region Tour** (Wine Tour)
   - Full day, $55/person
   - Multiple wineries, traditional lunch included

4. **Mtskheta & Jvari Monastery** (Historical)
   - 5 hours, $30/person
   - UNESCO heritage sites

5. **Vardzia Cave Monastery** (Historical - Featured)
   - Full day, $75/person
   - 12th-century cave complex

6. **Georgian Cooking Class** (Food)
   - 4 hours, $45/person
   - Hands-on cooking with local family

## How to Run:

1. Make sure your MongoDB is running
2. Navigate to the server directory:
   ```bash
   cd server
   ```

3. Run the seed script:
   ```bash
   node scripts/seedTours.js
   ```

## What it does:

- Clears all existing tours
- Inserts 6 sample tours with complete data
- Each tour includes:
  - Name, descriptions, pricing
  - Category, difficulty, duration
  - Detailed itinerary
  - What's included/excluded
  - Available days and languages
  - Meeting points and locations
  - Sample images (from Unsplash)

## After Seeding:

1. Go to `/admin/tours` to see the tours
2. Tours are automatically marked as available
3. Some tours are marked as "featured"
4. You can edit/delete tours from the admin panel
5. Users can now book these tours from `/tours`

## Creating Tours via Admin Panel:

Instead of using the seed script, you can also create tours manually:

1. Go to `/admin/tours`
2. Click "Add New Tour"
3. Fill in the form with tour details
4. Upload images
5. Click "Create Tour"

## Tour Images:

The seed script uses placeholder images from Unsplash. In production, you should:
- Upload real tour photos
- Use your own Cloudinary account for image hosting
- Replace the image URLs in the tour form

## Note:

This is sample data for testing. Make sure to replace with your actual tour offerings!
