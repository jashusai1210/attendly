/**
 * ATTENDLY — Attendance Calculator & Savage Tenglish Roasts
 *
 * Preserves original ATTENDLY calculator logic, including 100% target handling,
 * classes needed, bunkable classes, and all 64 original Tenglish roasts.
 */

export const TENGLISH_ROASTS = [
  // 0 - 39.99%
  { min: 0, max: 39.99, text: "Rey babu, college ki admission teesukunnava leka vacation package book chesava? 😭" },
  { min: 0, max: 39.99, text: "Nee attendance chusi biometric machine kuda 'ee person evaru?' antundhi ra 💀" },
  { min: 0, max: 39.99, text: "Classroom lo nee presence rare Pokémon laga undhi ra!" },
  { min: 0, max: 39.99, text: "College ID card undhi… attendance matram missing person case lo undhi." },
  { min: 0, max: 39.99, text: "Nee attendance graph chusthe ECG machine kuda tension paduthundhi ra 😭" },
  { min: 0, max: 39.99, text: "Semester motham nee kosam wait chesindhi… nuvvu matram darshanam ivvaledhu." },
  { min: 0, max: 39.99, text: "Rey, nuvvu student aa leka college ki occasional guest aa?" },
  { min: 0, max: 39.99, text: "Nee bench meedha dust ki kuda permanent address vachhesindhi." },
  { min: 0, max: 39.99, text: "Attendance register lo nee peru undhi, memories lo matram nee face ledhu." },
  { min: 0, max: 39.99, text: "College gate security uncle ki nuvvu kuda new admission la anipisthav." },
  { min: 0, max: 39.99, text: "Nee attendance ki comeback ante first nuvvu college ki comeback ivvali ra." },
  { min: 0, max: 39.99, text: "Class ki raakapovadam lo PhD chesinattu undhi… certificate ekkada?" },

  // 40 - 59.99%
  { min: 40, max: 59.99, text: "Nee attendance kanna Wi-Fi signal stable ga undhi ra 💀" },
  { min: 40, max: 59.99, text: "Rey babu, class ki vasthunnava leka attendance ki just trailer chupisthunnava?" },
  { min: 40, max: 59.99, text: "HOD nee attendance chusthe tea break extend chesthadu." },
  { min: 40, max: 59.99, text: "Nuvvu college lo unnav ani proof ki CCTV footage submit cheyyali emo." },
  { min: 40, max: 59.99, text: "Attendance situation chusthe calculator kuda silent mode loki vellipoyindhi." },
  { min: 40, max: 59.99, text: "Nee bunking consistency ki attendance matram opposite direction lo consistent ga undhi." },
  { min: 40, max: 59.99, text: "Class lo nee seat ni vere vallaki rent ki ivvochu ra." },
  { min: 40, max: 59.99, text: "Semester ki nuvvu cameo role chesthunnav… adhi kuda interval mundhe." },
  { min: 40, max: 59.99, text: "Rey, attendance penchali ante college ki vellali ani evaraina cheppara? 😭" },
  { min: 40, max: 59.99, text: "Nee attendance chusi calendar kuda 'nenu em paapam chesa?' antundhi." },
  { min: 40, max: 59.99, text: "Class timetable lo nee peru special appearance ani pettali." },
  { min: 40, max: 59.99, text: "Bunking lo world record try chesthunnava? Practice aapu ra!" },

  // 60 - 69.99%
  { min: 60, max: 69.99, text: "Academic comeback antunnav… mundhu college ki comeback ivvu ra 😭" },
  { min: 60, max: 69.99, text: "Border lo batukuthunnav babu… oka wrong step, semester gone." },
  { min: 60, max: 69.99, text: "Nee attendance relationship status: it's complicated." },
  { min: 60, max: 69.99, text: "Inka konchem sincere ga unte student la kanipisthav ra 😂" },
  { min: 60, max: 69.99, text: "Attendance target ninnu chusthundhi… nuvvu target ni chusthunnav." },
  { min: 60, max: 69.99, text: "Comeback loading… network slow ga undhi anukunta." },
  { min: 60, max: 69.99, text: "Nuvvu pass avvadaniki kaadhu, attendance tho negotiate cheyadaniki vachhav." },
  { min: 60, max: 69.99, text: "Oka side bunking, inko side tension… middle lo nee student life." },
  { min: 60, max: 69.99, text: "Attendance ni serious ga teesuko ra, adhi joke anukunte adhe joke chesthundhi." },
  { min: 60, max: 69.99, text: "Nee attendance ki motivation speech kaadhu, daily attendance kavali." },

  // 70 - 74.99%
  { min: 70, max: 74.99, text: "Target daggara parking chesav… lopaliki drive cheyyi ra!" },
  { min: 70, max: 74.99, text: "Pass mark daggara pose isthe saripodhu babu, cross cheyyali." },
  { min: 70, max: 74.99, text: "Attendance survival mode ON. Bunk button konni rojulu uninstall cheyyi." },
  { min: 70, max: 74.99, text: "Nuvvu attendance ni chase chesthunnava, attendance ninnu chase chesthundha?" },
  { min: 70, max: 74.99, text: "Inka konni classes attend avvu ra… HOD tho eye contact easy avuthundhi." },
  { min: 70, max: 74.99, text: "Nee attendance cliffhanger episode la undhi. Next episode lo em avuthundho chudali." },
  { min: 70, max: 74.99, text: "Bunking ki break ivvu. Attendance ki oka chance ivvu." },

  // 75 - 84.99%
  { min: 75, max: 84.99, text: "Not bad ra… kaani 85% gate daggara security check undhi." },
  { min: 75, max: 84.99, text: "Almost responsible student. Almost ante almost eh ra 😂" },
  { min: 75, max: 84.99, text: "Attendance improve ayyindhi… intlo vallaki good news cheppochu." },
  { min: 75, max: 84.99, text: "Bunking gang ninnu miss avuthundhi, kani future thanks chepthundhi." },
  { min: 75, max: 84.99, text: "Inka konchem effort pettu ra. HOD kuda shock avvali." },
  { min: 75, max: 84.99, text: "Student mode activate ayyindhi. Don't switch back to vacation mode." },

  // 85 - 89.99%
  { min: 85, max: 89.99, text: "85% reach ayyav! Ippudu overconfidence tho attendance ni crash cheyyaku." },
  { min: 85, max: 89.99, text: "Miracle ra babu! Classroom lo nee face kuda gurthupaduthundhi 😂" },
  { min: 85, max: 89.99, text: "HOD register open chesi nee attendance chusi okasari smile ichhademo." },
  { min: 85, max: 89.99, text: "Responsible student vibes… maintain cheyyi ra, temporary kaakudadhu." },
  { min: 85, max: 89.99, text: "Bunking gang nunchi resignation letter submit chesava enti?" },
  { min: 85, max: 89.99, text: "Attendance bagundhi. Ippudu academics kuda alane chusko." },

  // 90 - 99.99%
  { min: 90, max: 99.99, text: "Rey, nee attendance chusi biometric machine emotional ayyindhi." },
  { min: 90, max: 99.99, text: "HOD favourite student list lo entry confirm anipisthundhi 😂" },
  { min: 90, max: 99.99, text: "Class ki nuvvu regular… canteen uncle ki kuda proud ga undhi." },
  { min: 90, max: 99.99, text: "Attendance king! Kaani konchem life kuda enjoy cheyyi ra." },
  { min: 90, max: 99.99, text: "Nee attendance chusi proxy gang group nunchi remove chesaru emo." },
  { min: 90, max: 99.99, text: "Discipline level high. Friends ninnu undercover faculty anukuntunnaru." },

  // 100%
  { min: 100, max: 100, text: "Nuvvu emanna watchman duty chesthunnava college lo? 😭💀" },
  { min: 100, max: 100, text: "Rey, intiki vellava asalu? College gate daggare rent ki room teesuko!" },
  { min: 100, max: 100, text: "Principal ki nee attendance chusi attendance ivvali anipisthundhi." },
  { min: 100, max: 100, text: "Nuvvu student aa leka college permanent staff aa ra? 😂" },
  { min: 100, max: 100, text: "College closing time lo lights off chesi nuvve lock vesthunnava?" },
  { min: 100, max: 100, text: "Attendance 100%… nee intlo vallaki nee darshanam appointment tho na?" }
];

/**
 * Calculate attendance metrics according to original ATTENDLY rules.
 *
 * @param {Object} params
 * @param {number} params.total - Total working days / classes
 * @param {number} params.attended - Days / classes attended
 * @param {number} params.targetPercent - Target threshold (e.g. 70, 75, 80, 85, 90, 95, 100)
 */
export function calculateAttendanceKarma({ total, attended, targetPercent }) {
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(attended) ||
    !Number.isInteger(total) ||
    !Number.isInteger(attended)
  ) {
    throw new Error("Whole numbers enter cheyyi ra. Half-day maths ikkada vaddu.");
  }

  if (total < 1) {
    throw new Error("Total working days at least 1 undali.");
  }

  if (attended < 0 || attended > total) {
    throw new Error("Attended days 0 nunchi total working days varaku undali. Maths ni champaku 😭");
  }

  const percentage = (attended / total) * 100;
  const target = targetPercent / 100;

  // Minimum future classes to attend, assuming every future class is attended:
  // (attended + x) / (total + x) >= target
  const classesNeeded =
    percentage >= targetPercent
      ? 0
      : targetPercent === 100
        ? Infinity
        : Math.ceil((target * total - attended) / (1 - target));

  // Maximum future classes that can be missed while keeping attendance >= target:
  // attended / (total + y) >= target
  const bunkable =
    percentage < targetPercent
      ? 0
      : Math.max(0, Math.floor(attended / target - total + 1e-10));

  const isSafe = percentage >= targetPercent;

  let explanation;
  if (targetPercent === 100 && percentage < 100) {
    explanation = "100% target ni previous absences tarvatha finite number of future classes tho reach cheyyalem. College policy ni confirm chesuko.";
  } else if (isSafe) {
    explanation = bunkable === 0
      ? "Target reach ayyav, but currently you have no full future class to miss without dropping below the selected target. Safe ga attend avvu."
      : `Target reach ayyav. Maths prakaaram, next ${bunkable} future classes miss chesina target daggara/above untav, assuming no other attendance changes. Don't push your luck.`;
  } else {
    explanation = `Selected target reach avvalante next ${classesNeeded} consecutive classes attend cheyyali, and aa madhyalo classes miss avvakudadhu. Ippudu target kanna below lo unnav.`;
  }

  return {
    percentage,
    classesNeeded,
    bunkable,
    isSafe,
    explanation
  };
}

/**
 * Select a random Tenglish roast for a given attendance percentage.
 * Avoids repeating the immediately previous roast when possible.
 */
export function chooseRoast(percentage, lastIndex = -1) {
  const eligible = TENGLISH_ROASTS
    .map((meme, index) => ({ meme, index }))
    .filter((item) => percentage >= item.meme.min && percentage <= item.meme.max);

  const pool = eligible.length > 0
    ? eligible
    : TENGLISH_ROASTS.map((meme, index) => ({ meme, index }));

  let choices = pool.filter((item) => item.index !== lastIndex);
  if (!choices.length) choices = pool;

  const chosen = choices[Math.floor(Math.random() * choices.length)];
  return {
    text: chosen.meme.text,
    index: chosen.index
  };
}
