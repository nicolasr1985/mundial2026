// update-match-dates-3.js - Fix France vs Norway date
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const FIXES = [
  // ICS: 20260626T190000Z = Jun 26 2:00 PM Bogota
  { home: "France", away: "Norway", date: "2026-06-26T14:00:00-05:00" },
  // ICS: 20260626T190000Z = Jun 26 2:00 PM Bogota  
  { home: "Senegal", away: "Iraq", date: "2026-06-26T14:00:00-05:00" },
  // Also fix Norway vs France (may be stored this way)
  { home: "Norway", away: "France", date: "2026-06-26T14:00:00-05:00" },
  { home: "Iraq", away: "Senegal", date: "2026-06-26T14:00:00-05:00" },
];

async function fix() {
  const snapshot = await db.collection("matches").get();
  let updated = 0;

  for (const entry of FIXES) {
    const match = snapshot.docs.find(
      (d) => d.data().homeTeam === entry.home && d.data().awayTeam === entry.away
    );
    if (!match) continue;

    const newDate = new Date(entry.date);
    await db.collection("matches").doc(match.id).update({
      matchDate: admin.firestore.Timestamp.fromDate(newDate),
    });
    console.log(`✅ Fixed: ${entry.home} vs ${entry.away} → ${newDate.toISOString()}`);
    updated++;
  }

  console.log(`\n✅ ${updated} matches fixed`);
  process.exit(0);
}

fix().catch((err) => { console.error(err); process.exit(1); });
