# 🍎 RideShare App - macOS Quick Start Guide

Complete step-by-step instructions to run the app on your Mac in 10 minutes.

---

## Step 1: Install Prerequisites (5 minutes)

### 1.1 Open Terminal

```bash
# Press: Cmd + Space
# Type: Terminal
# Press: Enter
```

You should see a terminal window with `$` prompt.

### 1.2 Check if Node.js is Installed

```bash
node --version
```

**If you see a version number** (like `v18.x.x`), skip to Step 1.4.

**If you see "command not found"**, continue to Step 1.3.

### 1.3 Install Node.js (if needed)

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Verify installation
node --version    # Should show v18.x.x or higher
npm --version     # Should show 9.x.x or higher
```

### 1.4 Install pnpm (Package Manager)

```bash
npm install -g pnpm

# Verify installation
pnpm --version    # Should show 9.x.x or higher
```

### 1.5 Install Expo CLI

```bash
npm install -g expo-cli

# Verify installation
expo --version    # Should show 52.x.x or higher
```

---

## Step 2: Extract and Setup Project (3 minutes)

### 2.1 Extract the Zip File

```bash
# Navigate to Downloads folder
cd ~/Downloads

# Extract the zip file
unzip rideshare-app-final-with-docs.zip

# Navigate to project folder
cd rideshare-app

# Verify you're in the right place
pwd    # Should show: /Users/YourName/Downloads/rideshare-app
ls     # Should show: app, components, server, package.json, etc.
```

### 2.2 Install Dependencies

```bash
# Install all packages (this takes 2-3 minutes)
pnpm install

# You should see:
# ✓ Packages in scope: rideshare-app
# ✓ Packages installed
```

### 2.3 Create Environment File

```bash
# Copy example environment file
cp .env.example .env

# Verify file was created
ls -la .env    # Should show the file
```

---

## Step 3: Start the App (2 minutes)

### 3.1 Start Development Server

```bash
# From the rideshare-app folder, run:
pnpm dev

# You should see output like:
# ✓ Expo Metro Bundler ready at http://localhost:8081
# ✓ API server ready at http://localhost:3000
# ✓ Scan QR code with Expo Go app
```

**Keep this terminal window open!** The app is now running.

### 3.2 Open App in Web Browser (Easiest Option)

```bash
# Open a new terminal window (Cmd + T)
# Or open browser manually:
open http://localhost:8081

# The app should load in your browser
```

You should see the RideShare app home screen!

### 3.3 Alternative: Open in Expo Go (on your phone)

```bash
# 1. Install Expo Go app on your iPhone
#    - Open App Store
#    - Search: "Expo Go"
#    - Tap Install

# 2. In the terminal where pnpm dev is running,
#    you'll see a QR code

# 3. Open Expo Go app on your phone

# 4. Tap "Scan QR Code"

# 5. Point camera at the QR code in terminal

# 6. App opens on your phone!
```

### 3.4 Alternative: Open in iOS Simulator

```bash
# In a new terminal window:
pnpm ios

# This will:
# - Open iOS Simulator
# - Build and run the app
# - Show the app on your Mac screen
```

---

## Step 4: Test the App

### 4.1 Home Screen

You should see:
- "Where to?" button
- "Share a Ride" button
- "Recent Rides" section
- "Driver Mode" toggle

### 4.2 Book a Ride

```bash
# Tap "Where to?" button
# Enter: "Times Square"
# Enter: "Grand Central"
# Tap "Book Ride"
# See fare estimate: ~$25.50
```

### 4.3 View My Rides

```bash
# Tap "My Rides" tab (bottom)
# See list of rides
# Tap a ride to see details
```

### 4.4 View Profile

```bash
# Tap "Profile" tab (bottom)
# See user info
# Toggle "Driver Mode" to see driver dashboard
```

---

## Step 5: Make Changes (Optional)

### 5.1 Edit Home Screen

```bash
# Open text editor:
open -a "Visual Studio Code" ~/Downloads/rideshare-app

# Navigate to: app/(tabs)/index.tsx

# Change line with "Welcome" text:
# FROM: <Text>Welcome</Text>
# TO:   <Text>Welcome to RideShare!</Text>

# Save file (Cmd + S)

# App automatically reloads!
```

### 5.2 Change Theme Color

```bash
# Open: theme.config.js

# Change primary color:
# FROM: primary: { light: '#0a7ea4', dark: '#0a7ea4' }
# TO:   primary: { light: '#FF6B6B', dark: '#FF6B6B' }

# Save file

# App automatically reloads with new color!
```

---

## Step 6: Stop the App

### 6.1 Stop Development Server

```bash
# In the terminal where pnpm dev is running:
# Press: Ctrl + C

# You should see:
# ^C
# Stopping development server...
```

### 6.2 Stop iOS Simulator (if running)

```bash
# Close the iOS Simulator window
# Or press: Cmd + Q while simulator is active
```

---

## Troubleshooting

### Problem: "pnpm: command not found"

```bash
# Solution: Install pnpm
npm install -g pnpm

# Verify
pnpm --version
```

### Problem: "Port 8081 already in use"

```bash
# Solution: Kill the process using port 8081
lsof -ti:8081 | xargs kill -9

# Then restart:
pnpm dev
```

### Problem: "Cannot find module"

```bash
# Solution: Reinstall dependencies
rm -rf node_modules
pnpm install

# Then restart:
pnpm dev
```

### Problem: App shows blank screen

```bash
# Solution: Clear cache and restart
# Press Ctrl + C to stop pnpm dev

# Clear cache:
rm -rf .expo

# Restart:
pnpm dev
```

### Problem: "Metro Bundler error"

```bash
# Solution: Clear Metro cache
pnpm dev --clear

# If still not working:
rm -rf node_modules .expo
pnpm install
pnpm dev
```

---

## Next Steps

### Option 1: Explore the App (No Coding)

```bash
# Just run and explore all screens:
pnpm dev

# Try:
# - Book a ride
# - View my rides
# - Toggle driver mode
# - View profile
# - Check wallet
# - View analytics
```

### Option 2: Learn the Code

```bash
# Read the guides:
# 1. Open: COMPLETE_GUIDE.md
# 2. Read: "Frontend Development" section
# 3. Try editing a screen

# Edit home screen:
open -a "Visual Studio Code" app/(tabs)/index.tsx

# Make a change and save
# App reloads automatically!
```

### Option 3: Connect to Real Backend

```bash
# 1. Get your backend URL
# 2. Edit .env file:
nano .env

# 3. Change:
# EXPO_PUBLIC_API_URL=http://localhost:3000
# TO:
# EXPO_PUBLIC_API_URL=https://your-backend-url.com

# 4. Save and restart:
pnpm dev
```

### Option 4: Deploy to App Store

```bash
# Read: DEPLOYMENT_GUIDE.md
# Follow: "iOS Deployment" section
# Run: eas build --platform ios
```

---

## Quick Reference

```bash
# Navigate to project
cd ~/Downloads/rideshare-app

# Install dependencies
pnpm install

# Start development
pnpm dev

# Open in browser
open http://localhost:8081

# Run on iOS Simulator
pnpm ios

# Run tests
pnpm test

# Check TypeScript errors
pnpm check

# Format code
pnpm format

# Stop development (in terminal)
Ctrl + C
```

---

## File Locations

```
~/Downloads/rideshare-app/
├── app/                    # Screens
├── components/             # UI components
├── server/                 # Backend
├── lib/                    # Utilities
├── COMPLETE_GUIDE.md       # Full documentation
├── ARCHITECTURE_DEEP_DIVE.md
├── QUICKSTART.md
└── package.json
```

---

## Important Notes

1. **Keep terminal open** - The `pnpm dev` command must keep running
2. **Hot reload** - Changes to files automatically reload the app
3. **Mock data** - App uses fake data by default (no real database needed)
4. **No API keys needed** - Everything works without Twilio/Stripe keys
5. **Localhost only** - App only works on your local machine by default

---

## Getting Help

If you get stuck:

1. **Check COMPLETE_GUIDE.md** - Section "Troubleshooting"
2. **Check ARCHITECTURE_DEEP_DIVE.md** - Section "Code Examples"
3. **Check terminal output** - Error messages are usually helpful
4. **Restart everything** - Stop `pnpm dev` and run again

---

**You're all set! Your RideShare app is now running on your Mac!** 🎉

Next time you want to run it:
```bash
cd ~/Downloads/rideshare-app
pnpm dev
open http://localhost:8081
```
