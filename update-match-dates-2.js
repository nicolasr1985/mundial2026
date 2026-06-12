// update-match-dates-2.js - Fix remaining matches (home/away swapped in Firestore)
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CORRECT_TIMES = [
  { home: "Switzerland", away: "Qatar", date: "2026-06-13T14:00:00-05:00" },
  { home: "Scotland", away: "Brazil", date: "2026-06-24T17:00:00-05:00" },
  { home: "Turkey", away: "United States", date: "2026-06-25T21:00:00-05:00" },
  { home: "Ecuador", away: "Germany", date: "2026-06-25T15:00:00-05:00" },
  { home: "Sweden", away: "Tunisia", date: "2026-06-14T21:00:00-05:00" },
  { home: "Tunisia", away: "Japan", date: "2026-06-20T23:00:00-05:00" },
  { home: "Japan", away: "Sweden", date: "2026-06-25T18:00:00-05:00" },
  { home: "Tunisia", away: "Netherlands", date: "2026-06-25T18:00:00-05:00" },
  { home: "Iran", away: "New Zealand", date: "2026-06-15T20:00:00-05:00" },
  { home: "New Zealand", away: "Egypt", date: "2026-06-21T20:00:00-05:00" },
  { home: "Egypt", away: "Iran", date: "2026-06-26T22:00:00-05:00" },
  { home: "New Zealand", away: "Belgium", date: "2026-06-26T22:00:00-05:00" },
  { home: "Uruguay", away: "Spain", date: "2026-06-26T19:00:00-05:00" },
  { home: "Iraq", away: "Norway", date: "2026-06-16T17:00:00-05:00" },
  { home: "Jordan", away: "Argentina", date: "2026-06-27T21:00:00-05:00" },
  { home: "Colombia", away: "Portugal", date: "2026-06-27T18:30:00-05:00" },
  { home: "Switzerland", away: "Bosnia and Herzegovina", date: "2026-06-24T14:00:00-05:00" },
];

async function updateMatches() {
  const snapshot = await db.collection("matches").get();
  let updated = 0;
  let notFound = [];

  for (const entry of CORRECT_TIMES) {
    // Try both orders
    let match = snapshot.docs.find(
      (d) => d.data().homeTeam === entry.home && d.data().awayTeam === entry.away
    );
    if (!match) {
      match = snapshot.docs.find(
        (d) => d.data().homeTeam === entry.away && d.data().awayTeam === entry.home
      );
    }

    if (!match) {
      notFound.push(`${entry.home} vs ${entry.away}`);
      continue;
    }

    const newDate = new Date(entry.date);
    await db.collection("matches").doc(match.id).update({
      matchDate: admin.firestore.Timestamp.fromDate(newDate),
    });
    console.log(`✅ Updated: ${match.data().homeTeam} vs ${match.data().awayTeam} → ${newDate.toISOString()}`);
    updated++;
  }

  console.log(`\n✅ ${updated} matches updated`);
  if (notFound.length > 0) {
    console.log(`\n❌ Still not found:`);
    notFound.forEach((m) => console.log(`  - ${m}`));
  }
  process.exit(0);
}

updateMatches().catch((err) => { console.error(err); process.exit(1); });
