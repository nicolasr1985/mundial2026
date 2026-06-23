const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, updateDoc, query, where } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyAEoQ703Z3FuxyMLn151yJIaWROWvIX5pk",
  authDomain: "polla-mundial-2026-1ee82.firebaseapp.com",
  projectId: "polla-mundial-2026-1ee82",
  storageBucket: "polla-mundial-2026-1ee82.firebasestorage.app",
  messagingSenderId: "35530142210",
  appId: "1:35530142210:web:7d78262b969fe4874a2d1b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log("Fetching matches...");
  const snap = await getDocs(collection(db, "matches"));

  const now = new Date();
  const suspicious = [];

  snap.forEach((d) => {
    const m = d.data();
    if (m.status !== "finished") return;
    const kickoff = m.matchDate?.toDate ? m.matchDate.toDate() : null;
    // Suspicious: marked finished but kickoff time is in the future
    if (kickoff && kickoff > now) {
      suspicious.push({ id: d.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: m.homeScore, awayScore: m.awayScore, kickoff });
    }
  });

  console.log(`\nFound ${suspicious.length} suspicious matches (marked finished but kickoff is in the future):\n`);
  suspicious.forEach((m) => {
    console.log(`- ${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam} | kickoff: ${m.kickoff.toLocaleString()}`);
  });

  const args = process.argv.slice(2);
  if (!args.includes("--revert")) {
    console.log("\nDry run only. Re-run with --revert to actually reset these matches.");
    process.exit(0);
  }

  console.log("\nReverting...");
  for (const m of suspicious) {
    await updateDoc(doc(db, "matches", m.id), {
      status: "upcoming",
      homeScore: null,
      awayScore: null,
      locked: false,
      homeYellow: 0,
      awayYellow: 0,
      homeRed: 0,
      awayRed: 0,
      homeYellowRed: 0,
      awayYellowRed: 0,
    });
    console.log(`Reverted: ${m.homeTeam} vs ${m.awayTeam}`);
  }

  console.log(`\nDone. Reverted ${suspicious.length} matches.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
