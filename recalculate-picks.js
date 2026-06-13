const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, writeBatch, doc } = require("firebase/firestore");

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

function calculateMatchPoints(predHome, predAway, realHome, realAway) {
  if (predHome === realHome && predAway === realAway) return 5;
  let pts = 0;
  if (Math.sign(predHome - predAway) === Math.sign(realHome - realAway)) pts += 2;
  if (predHome === realHome) pts += 1;
  if (predAway === realAway) pts += 1;
  return pts;
}

async function main() {
  console.log("Fetching data...");
  const [matchesSnap, picksSnap] = await Promise.all([
    getDocs(collection(db, "matches")),
    getDocs(collection(db, "picks")),
  ]);

  const matchMap = {};
  for (const d of matchesSnap.docs) {
    const m = d.data();
    if (m.status === "finished" && m.homeScore !== null) {
      matchMap[d.id] = m;
    }
  }

  const batch = writeBatch(db);
  let updated = 0;

  for (const d of picksSnap.docs) {
    const pick = d.data();
    const match = matchMap[pick.matchId];
    if (!match) continue;

    const correctPts = calculateMatchPoints(
      pick.homeScore, pick.awayScore,
      match.homeScore, match.awayScore
    );

    if (pick.points !== correctPts) {
      console.log(`Fix: ${match.homeTeam} vs ${match.awayTeam} | Pick: ${pick.homeScore}-${pick.awayScore} | Real: ${match.homeScore}-${match.awayScore} | Was: ${pick.points} → Now: ${correctPts}`);
      batch.update(doc(db, "picks", d.id), { points: correctPts });
      updated++;
    }
  }

  if (updated > 0) {
    await batch.commit();
    console.log(`\nDone. Fixed ${updated} picks.`);
  } else {
    console.log("\nAll picks are already correct.");
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
