// update-all-matches-final.js
// Updates ALL group stage matches with correct Bogota times from official schedule
// Also tries both home/away orders in case Firestore has them swapped
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CORRECT_TIMES = [
  { home: "Mexico", away: "South Africa", date: "2026-06-11T14:00:00-05:00" },
  { home: "South Korea", away: "Czechia", date: "2026-06-11T21:00:00-05:00" },
  { home: "Canada", away: "Bosnia and Herzegovina", date: "2026-06-12T14:00:00-05:00" },
  { home: "United States", away: "Paraguay", date: "2026-06-12T20:00:00-05:00" },
  { home: "Qatar", away: "Switzerland", date: "2026-06-13T14:00:00-05:00" },
  { home: "Brazil", away: "Morocco", date: "2026-06-13T17:00:00-05:00" },
  { home: "Haiti", away: "Scotland", date: "2026-06-13T20:00:00-05:00" },
  { home: "Australia", away: "Turkey", date: "2026-06-13T23:00:00-05:00" },
  { home: "Germany", away: "Curacao", date: "2026-06-14T12:00:00-05:00" },
  { home: "Netherlands", away: "Japan", date: "2026-06-14T15:00:00-05:00" },
  { home: "Ivory Coast", away: "Ecuador", date: "2026-06-14T18:00:00-05:00" },
  { home: "Sweden", away: "Tunisia", date: "2026-06-14T21:00:00-05:00" },
  { home: "Spain", away: "Cape Verde", date: "2026-06-15T11:00:00-05:00" },
  { home: "Belgium", away: "Egypt", date: "2026-06-15T14:00:00-05:00" },
  { home: "Saudi Arabia", away: "Uruguay", date: "2026-06-15T17:00:00-05:00" },
  { home: "Iran", away: "New Zealand", date: "2026-06-15T20:00:00-05:00" },
  { home: "France", away: "Senegal", date: "2026-06-16T14:00:00-05:00" },
  { home: "Iraq", away: "Norway", date: "2026-06-16T17:00:00-05:00" },
  { home: "Argentina", away: "Algeria", date: "2026-06-16T20:00:00-05:00" },
  { home: "Austria", away: "Jordan", date: "2026-06-16T23:00:00-05:00" },
  { home: "Portugal", away: "Congo DR", date: "2026-06-17T12:00:00-05:00" },
  { home: "England", away: "Croatia", date: "2026-06-17T15:00:00-05:00" },
  { home: "Ghana", away: "Panama", date: "2026-06-17T18:00:00-05:00" },
  { home: "Uzbekistan", away: "Colombia", date: "2026-06-17T21:00:00-05:00" },
  { home: "Czechia", away: "South Africa", date: "2026-06-18T11:00:00-05:00" },
  { home: "Switzerland", away: "Bosnia and Herzegovina", date: "2026-06-18T14:00:00-05:00" },
  { home: "Canada", away: "Qatar", date: "2026-06-18T17:00:00-05:00" },
  { home: "Mexico", away: "South Korea", date: "2026-06-18T20:00:00-05:00" },
  { home: "United States", away: "Australia", date: "2026-06-19T14:00:00-05:00" },
  { home: "Scotland", away: "Morocco", date: "2026-06-19T17:00:00-05:00" },
  { home: "Brazil", away: "Haiti", date: "2026-06-19T19:30:00-05:00" },
  { home: "Turkey", away: "Paraguay", date: "2026-06-19T22:00:00-05:00" },
  { home: "Netherlands", away: "Sweden", date: "2026-06-20T12:00:00-05:00" },
  { home: "Germany", away: "Ivory Coast", date: "2026-06-20T15:00:00-05:00" },
  { home: "Ecuador", away: "Curacao", date: "2026-06-20T19:00:00-05:00" },
  { home: "Tunisia", away: "Japan", date: "2026-06-20T23:00:00-05:00" },
  { home: "Spain", away: "Saudi Arabia", date: "2026-06-21T11:00:00-05:00" },
  { home: "Belgium", away: "Iran", date: "2026-06-21T14:00:00-05:00" },
  { home: "Uruguay", away: "Cape Verde", date: "2026-06-21T17:00:00-05:00" },
  { home: "New Zealand", away: "Egypt", date: "2026-06-21T20:00:00-05:00" },
  { home: "Argentina", away: "Austria", date: "2026-06-22T12:00:00-05:00" },
  { home: "France", away: "Iraq", date: "2026-06-22T16:00:00-05:00" },
  { home: "Norway", away: "Senegal", date: "2026-06-22T19:00:00-05:00" },
  { home: "Jordan", away: "Algeria", date: "2026-06-22T22:00:00-05:00" },
  { home: "Portugal", away: "Uzbekistan", date: "2026-06-23T12:00:00-05:00" },
  { home: "England", away: "Ghana", date: "2026-06-23T15:00:00-05:00" },
  { home: "Panama", away: "Croatia", date: "2026-06-23T18:00:00-05:00" },
  { home: "Colombia", away: "Congo DR", date: "2026-06-23T21:00:00-05:00" },
  { home: "Switzerland", away: "Canada", date: "2026-06-24T14:00:00-05:00" },
  { home: "Bosnia and Herzegovina", away: "Qatar", date: "2026-06-24T14:00:00-05:00" },
  { home: "Morocco", away: "Haiti", date: "2026-06-24T17:00:00-05:00" },
  { home: "Scotland", away: "Brazil", date: "2026-06-24T17:00:00-05:00" },
  { home: "South Africa", away: "South Korea", date: "2026-06-24T20:00:00-05:00" },
  { home: "Czechia", away: "Mexico", date: "2026-06-24T20:00:00-05:00" },
  { home: "Curacao", away: "Ivory Coast", date: "2026-06-25T15:00:00-05:00" },
  { home: "Ecuador", away: "Germany", date: "2026-06-25T15:00:00-05:00" },
  { home: "Japan", away: "Sweden", date: "2026-06-25T18:00:00-05:00" },
  { home: "Tunisia", away: "Netherlands", date: "2026-06-25T18:00:00-05:00" },
  { home: "Paraguay", away: "Australia", date: "2026-06-25T21:00:00-05:00" },
  { home: "Turkey", away: "United States", date: "2026-06-25T21:00:00-05:00" },
  { home: "Norway", away: "France", date: "2026-06-26T14:00:00-05:00" },
  { home: "Senegal", away: "Iraq", date: "2026-06-26T14:00:00-05:00" },
  { home: "Cape Verde", away: "Saudi Arabia", date: "2026-06-26T19:00:00-05:00" },
  { home: "Uruguay", away: "Spain", date: "2026-06-26T19:00:00-05:00" },
  { home: "Egypt", away: "Iran", date: "2026-06-26T22:00:00-05:00" },
  { home: "New Zealand", away: "Belgium", date: "2026-06-26T22:00:00-05:00" },
  { home: "Croatia", away: "Ghana", date: "2026-06-27T16:00:00-05:00" },
  { home: "Panama", away: "England", date: "2026-06-27T16:00:00-05:00" },
  { home: "Colombia", away: "Portugal", date: "2026-06-27T18:30:00-05:00" },
  { home: "Congo DR", away: "Uzbekistan", date: "2026-06-27T18:30:00-05:00" },
  { home: "Algeria", away: "Austria", date: "2026-06-27T21:00:00-05:00" },
  { home: "Jordan", away: "Argentina", date: "2026-06-27T21:00:00-05:00" },
];

async function updateMatches() {
  const snapshot = await db.collection("matches").get();
  let updated = 0;
  let notFound = [];

  for (const entry of CORRECT_TIMES) {
    // Try both home/away orders
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
    console.log(`✅ ${match.data().homeTeam} vs ${match.data().awayTeam} → ${newDate.toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
    updated++;
  }

  console.log(`\n✅ ${updated} matches updated`);
  if (notFound.length > 0) {
    console.log(`\n❌ Not found:`);
    notFound.forEach((m) => console.log(`  - ${m}`));
  }
  process.exit(0);
}

updateMatches().catch((err) => { console.error(err); process.exit(1); });
