# How to Enable Cloud Sync (Free)

To enable the "Sign In" feature and sync your predictions across devices, you need to grab free API keys from Google Firebase. It takes about 2 minutes.

## Step 1: Create Project
1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Click **"Add project"**.
3. Name it `medi-picks-2025` (or anything you want).
4. Disable Google Analytics (faster setup).
5. Click **"Create project"**.

## Step 2: Enable Authentication
1. On the left sidebar, click **Build** -> **Authentication**.
2. Click **"Get started"**.
3. Click **"Google"** in the "Sign-in providers" list.
4. Toggle **Enable**.
5. Select your support email.
6. Click **Save**.

## Step 3: Enable Database
1. On the left sidebar, click **Build** -> **Firestore Database**.
2. Click **"Create database"**.
3. Choose a location (e.g., `nam5 (us-central)`).
4. **IMPORTANT:** Select **"Start in production mode"**.
5. Click **Next** -> **Enable**.
6. Once created, go to the **Rules** tab.
7. Replace the code with this (allows anyone signed in to write their own data):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
8. Click **Publish**.

## Step 4: Get Your Keys
1. Click the **Gear Icon** (Project settings) next to "Project Overview" in the top left.
2. Scroll down to "Your apps".
3. Click the **Web** icon (</>).
4. Register app as `medi-picks-web` (no need to check Hosting).
5. You will see a code block `const firebaseConfig = { ... }`.
6. Copy the values into your local `.env` file in this folder.

## Step 5: Update .env File
Open the `.env` file in this folder and paste your values:

```
REACT_APP_FIREBASE_API_KEY=AIzaSy...
REACT_APP_FIREBASE_AUTH_DOMAIN=medi-picks-....firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=medi-picks-...
REACT_APP_FIREBASE_STORAGE_BUCKET=medi-picks-....appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456...
REACT_APP_FIREBASE_APP_ID=1:123456...
```

**That's it! The app will now automatically detect the keys and enable the Cloud Sync feature.**
