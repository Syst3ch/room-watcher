# Room Watcher — מעקב זמינות חדרים

בודק כל 5 דקות אם "Double Room" או "Double Room Sea View" זמינים בדף ההזמנות,
ושולח הודעת טלגרם אם כן.

## שלב 1: בוט טלגרם (2 דקות)

1. פתח שיחה עם [@BotFather](https://t.me/BotFather) בטלגרם, שלח `/newbot`, תן שם.
   תקבל **TELEGRAM_BOT_TOKEN** (משהו כמו `123456:ABC-...`).
2. שלח כל הודעה לבוט החדש שלך (כדי שיהיה לו איפה לענות).
3. פתח בדפדפן: `https://api.telegram.org/bot<הטוקן>/getUpdates`
   ותמצא שם `"chat":{"id": 123456789}` — זה ה־**TELEGRAM_CHAT_ID** שלך.

## שלב 2: להעלות לגיטהאב

1. צור repo חדש (יכול להיות פרטי) בגיטהאב.
2. העלה אליו את כל התיקייה הזו (`check-room.js`, `package.json`, `.github/workflows/check-room.yml`).
3. ב־Settings → Secrets and variables → Actions → New repository secret, הוסף:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

זהו. GitHub Actions ירוץ אוטומטית כל 5 דקות בחינם (בתוכנית החינמית יש 2000 דקות/חודש
ל־repo פרטי, וריצה כזו לוקחת כ־1-2 דקות — מספיק בנוחות).

## שלב 3: לבדוק שזה עובד לפני שסומכים עליו

זה החלק הכי חשוב. אתרי הזמנות בונים את הדף עם JavaScript ובמבנה שאני לא יכול
לראות מראש (האתר חוסם גישה אוטומטית לבדיקה מרחוק), אז ה"ניחוש" איך לזהות
"זמין" מול "לא זמין" צריך אימות ידני:

1. התקן מקומית: `npm install && npx playwright install chromium`
2. הרץ עם דיבאג: `DEBUG=1 node check-room.js`
   (או `npm run check:debug`)
3. זה ייצור `debug-screenshot.png` ו־`debug-page-text.txt` — תפתח אותם ותראה
   בדיוק מה הדף מציג ומה הסקריפט "רואה" כטקסט.
4. אם הזיהוי לא מדויק (למשל מזהה "זמין" כשבעצם "אזל"), פתח את `check-room.js`
   ותעדכן את הרשימות `AVAILABLE_HINTS` / `UNAVAILABLE_HINTS` לפי המילים שבאמת
   מופיעות בדף אצלך.

## הפעלה ידנית

אפשר גם להריץ בכל רגע נתון מלשונית Actions בגיטהאב → Check Room Availability →
Run workflow, בלי לחכות ל־5 דקות הבאות.

## הערות

- אחרי 60 יום בלי שום פעילות ב־repo, GitHub משבית אוטומטית cron jobs —
  אם זה מעקב ארוך טווח, תיכנס מדי פעם ל־repo (או תעשה בו commit ריק).
- אם האתר יחליף מבנה עמוד, הזיהוי עלול להישבר בשקט (לא יתריע, לא יקרוס) —
  כדאי מדי פעם לבדוק ידנית שהמייל/ההתראה עדיין "חי".
