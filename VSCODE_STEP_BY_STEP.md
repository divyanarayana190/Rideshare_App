# 🔧 RideShare App - VS Code Step-by-Step Guide (macOS)

Complete visual guide to run the app in Visual Studio Code.

---

## STEP 1: Open VS Code

### 1.1 Launch VS Code

```
1. Press: Cmd + Space (opens Spotlight search)
2. Type: "Visual Studio Code"
3. Press: Enter
```

You should see VS Code open with a welcome screen.

---

## STEP 2: Open the Project Folder

### 2.1 Open Folder

```
In VS Code:
1. Click: File (top menu)
2. Click: Open Folder
```

A dialog box appears asking you to select a folder.

### 2.2 Navigate to Project

```
1. In the dialog, click: Cmd + Shift + G (Go to folder)
2. Type: ~/Downloads/rideshare-app
3. Press: Enter
4. Click: Open (button in bottom right)
```

Wait a few seconds for VS Code to load the project.

### 2.3 Verify Project is Open

You should see on the left side:
```
📁 rideshare-app (folder name)
  📁 app
  📁 components
  📁 server
  📁 lib
  📄 package.json
  📄 .env.example
  ... more files
```

If you see this, you're in the right place! ✅

---

## STEP 3: Open Terminal in VS Code

### 3.1 Open Terminal

```
In VS Code:
1. Press: Ctrl + ` (backtick key, below Esc)

OR

1. Click: View (top menu)
2. Click: Terminal
```

You should see a terminal panel appear at the bottom of VS Code.

### 3.2 Verify Terminal is Open

You should see at the bottom:
```
Terminal  Debug Console  Problems

$ _
```

The `$` means you're ready to type commands.

### 3.3 Verify You're in the Right Folder

```
In the terminal, type:
pwd

Press: Enter
```

You should see:
```
/Users/YourName/Downloads/rideshare-app
```

If it shows this path, you're in the right place! ✅

---

## STEP 4: Install Dependencies

### 4.1 Run Install Command

```
In the terminal, type:
pnpm install

Press: Enter
```

The terminal will show:
```
Lockfile is up-to-date, resolution step is skipped
Packages in scope: rideshare-app
Linking packages in node_modules
✓ Packages installed
```

**This takes 2-3 minutes. Wait for it to finish.**

### 4.2 Verify Installation

After it finishes, you should see:
```
✓ Packages installed
```

If you see this, installation is complete! ✅

---

## STEP 5: Start the Development Server

### 5.1 Run Development Command

```
In the terminal, type:
pnpm dev

Press: Enter
```

The terminal will show lots of output. Wait for it to finish.

### 5.2 Look for Success Message

After about 30 seconds, you should see:
```
✓ Expo Metro Bundler ready at http://localhost:8081
✓ API server ready at http://localhost:3000
✓ Scan QR code with Expo Go app

QR Code: [QR code displayed]
```

**IMPORTANT: Keep this terminal running! Don't close it or press Ctrl+C.**

---

## STEP 6: Open the App in Browser

### 6.1 Open Browser

```
1. Open your web browser (Chrome, Safari, Firefox)
2. In the address bar, type:
   http://localhost:8081
3. Press: Enter
```

### 6.2 Wait for App to Load

The page will load for 10-20 seconds. You'll see:
```
Loading...
```

Then the RideShare app appears!

### 6.3 Verify App is Running

You should see the home screen with:
- "Where to?" button
- "Share a Ride" button
- "My Rides" tab at bottom
- "Profile" tab at bottom

If you see this, the app is running! ✅

---

## STEP 7: Test the App

### 7.1 Book a Ride

```
1. Click: "Where to?" button
2. See: "Book a Ride" screen
3. Scroll down to see:
   - Origin field
   - Destination field
   - Ride type selector
   - Fare estimate
```

### 7.2 View My Rides

```
1. Click: "My Rides" tab (bottom of screen)
2. See: List of rides
3. Click: Any ride to see details
```

### 7.3 View Profile

```
1. Click: "Profile" tab (bottom of screen)
2. See: User information
3. See: "Driver Mode" toggle
4. Toggle: "Driver Mode" to see driver dashboard
```

### 7.4 Test Driver Mode

```
1. In Profile tab, toggle: "Driver Mode" ON
2. See: Driver dashboard
3. See: Incoming ride requests
4. See: Accept/Decline buttons
```

---

## STEP 8: Edit Code and See Changes

### 8.1 Open Home Screen File

```
In VS Code left sidebar:
1. Click: app
2. Click: (tabs)
3. Click: index.tsx

The file opens in the editor
```

### 8.2 Find the Welcome Text

```
In the editor, look for:
<Text className="text-4xl font-bold text-foreground">Welcome</Text>

This is around line 20-30
```

### 8.3 Edit the Text

```
1. Click on the word: Welcome
2. Double-click to select it
3. Type: Welcome to RideShare!
4. Press: Cmd + S (save)
```

### 8.4 See Changes in Browser

```
1. Look at your browser (http://localhost:8081)
2. The app automatically reloads
3. You see: "Welcome to RideShare!" instead of "Welcome"
```

The app reloads automatically! ✅

---

## STEP 9: Change Theme Color

### 9.1 Open Theme File

```
In VS Code left sidebar:
1. Click: theme.config.js (in root folder)

The file opens in the editor
```

### 9.2 Find Primary Color

```
Look for:
primary: { light: '#0a7ea4', dark: '#0a7ea4' },

This is around line 2
```

### 9.3 Change Color

```
1. Select the color code: #0a7ea4
2. Replace with: #FF6B6B (red color)
3. Press: Cmd + S (save)
```

### 9.4 See Color Change in Browser

```
1. Look at your browser
2. The app automatically reloads
3. All blue colors become red!
```

---

## STEP 10: Stop the App

### 10.1 Stop Development Server

```
In the VS Code terminal:
1. Press: Ctrl + C

You should see:
^C
Stopping development server...
```

The app stops running.

### 10.2 Verify it Stopped

```
In your browser:
1. Refresh the page (Cmd + R)
2. You see: Connection refused error

This means the server stopped ✅
```

---

## STEP 11: Run Again Next Time

### 11.1 Start Development Again

```
In the VS Code terminal:
1. Type: pnpm dev
2. Press: Enter
```

The app starts again!

### 11.2 Open Browser

```
1. Go to: http://localhost:8081
2. App loads
```

---

## Quick Reference

### Common Commands in Terminal

```
pnpm install      # Install dependencies (first time only)
pnpm dev          # Start development server
pnpm test         # Run tests
pnpm check        # Check TypeScript errors
pnpm format       # Format code
Ctrl + C          # Stop server
```

### Keyboard Shortcuts in VS Code

```
Cmd + S           # Save file
Cmd + Z           # Undo
Cmd + Shift + Z   # Redo
Cmd + /           # Comment/uncomment
Cmd + F           # Find text
Cmd + H           # Find and replace
Ctrl + `          # Toggle terminal
```

### File Locations

```
app/(tabs)/index.tsx          # Home screen
app/(tabs)/rides.tsx          # My Rides screen
app/(tabs)/profile.tsx        # Profile screen
app/book-ride.tsx             # Book Ride screen
theme.config.js               # Theme colors
tailwind.config.js            # Tailwind config
package.json                  # Dependencies
```

---

## Troubleshooting

### Problem: "pnpm: command not found"

```
Solution:
1. In VS Code terminal, type:
   npm install -g pnpm
2. Press: Enter
3. Wait for installation
4. Try again: pnpm dev
```

### Problem: "Port 8081 already in use"

```
Solution:
1. In VS Code terminal, type:
   lsof -ti:8081 | xargs kill -9
2. Press: Enter
3. Try again: pnpm dev
```

### Problem: "Cannot find module"

```
Solution:
1. In VS Code terminal, press: Ctrl + C
2. Type: rm -rf node_modules
3. Press: Enter
4. Type: pnpm install
5. Press: Enter
6. Type: pnpm dev
7. Press: Enter
```

### Problem: App shows blank screen

```
Solution:
1. In VS Code terminal, press: Ctrl + C
2. Type: rm -rf .expo
3. Press: Enter
4. Type: pnpm dev
5. Press: Enter
6. Refresh browser: Cmd + R
```

### Problem: Changes don't appear in browser

```
Solution:
1. Make sure you saved the file: Cmd + S
2. Refresh browser: Cmd + R
3. Wait 5 seconds for app to reload
```

---

## File Structure Explained

```
rideshare-app/
│
├── app/                    # All screens
│   ├── (tabs)/            # Tab screens
│   │   ├── index.tsx      # Home screen
│   │   ├── rides.tsx      # My Rides
│   │   └── profile.tsx    # Profile
│   ├── _layout.tsx        # Root layout
│   └── book-ride.tsx      # Book Ride screen
│
├── components/            # Reusable components
│   ├── screen-container.tsx
│   └── live-map.tsx
│
├── lib/                   # Utilities
│   ├── types.ts
│   ├── mock-data.ts
│   └── rides-store.tsx
│
├── server/                # Backend
│   ├── routers.ts
│   └── db.ts
│
├── theme.config.js        # Colors
├── tailwind.config.js     # Tailwind
├── package.json           # Dependencies
└── .env                   # Environment variables
```

---

## Next Steps

### Option 1: Explore All Screens

```
1. Keep pnpm dev running
2. Click through all tabs and screens
3. Try all buttons
4. Test all features
```

### Option 2: Edit Code

```
1. Open any file in app/ folder
2. Make changes
3. Save: Cmd + S
4. See changes in browser automatically
```

### Option 3: Read Documentation

```
1. In VS Code, open: COMPLETE_GUIDE.md
2. Read: "Frontend Development" section
3. Try the examples
```

### Option 4: Deploy to App Store

```
1. Read: DEPLOYMENT_GUIDE.md
2. Follow: "iOS Deployment" section
3. Run: eas build --platform ios
```

---

## Important Notes

✅ **Keep terminal running** - Don't close the terminal with `pnpm dev`

✅ **Hot reload works** - Changes save automatically and app reloads

✅ **Mock data** - App uses fake data, no database needed

✅ **No API keys needed** - Everything works without Twilio/Stripe

✅ **Localhost only** - App only works on your Mac

---

**You're all set! Your RideShare app is running in VS Code!** 🎉

**Next time:**
```
1. Open VS Code
2. Open folder: ~/Downloads/rideshare-app
3. Open terminal: Ctrl + `
4. Type: pnpm dev
5. Open: http://localhost:8081
```
