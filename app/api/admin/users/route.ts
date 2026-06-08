// app/api/admin/users/route.ts
// Admin-only API route for user management
// Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars

import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

export async function POST(req: NextRequest) {
  try {
    const { action, uid } = await req.json();
    if (!uid || !action) return NextResponse.json({ error: "Missing uid or action" }, { status: 400 });

    const { auth, db } = getAdmin();

    if (action === "delete") {
      // Delete from Firebase Auth + Firestore
      await auth.deleteUser(uid);
      await db.collection("users").doc(uid).delete();
      // Also delete all picks for this user
      const picksSnap = await db.collection("picks").where("userId", "==", uid).get();
      const batch = db.batch();
      picksSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      return NextResponse.json({ success: true, message: "Usuario eliminado" });
    }

    if (action === "resetPassword") {
      // Generate password reset link
      const link = await auth.generatePasswordResetLink(
        (await auth.getUser(uid)).email!
      );
      return NextResponse.json({ success: true, link });
    }

    if (action === "toggleAdmin") {
      const user = await auth.getUser(uid);
      const userDoc = await db.collection("users").doc(uid).get();
      const isAdmin = userDoc.data()?.isAdmin ?? false;
      await db.collection("users").doc(uid).update({ isAdmin: !isAdmin });
      return NextResponse.json({ success: true, isAdmin: !isAdmin });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
