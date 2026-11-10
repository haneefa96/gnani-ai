# Native-Speaker Review Checklist (`docs/voice/native-review.md`)

All spoken TTS strings, read-back templates, confirmation keywords, and number-word tables in `backend/voice/normalise.py`, `backend/voice/readback.py`, and `backend/voice/confirmation.py` that require native-speaker verification across **Hindi (`hi-IN`)**, **Kannada (`kn-IN`)**, **Bengali (`bn-IN`)**, and **Indian English (`en-IN`)**.

---

## 1. Consent & Error Prompts (`backend/voice/readback.py`)

| Language | Consent Prompt | Retry / Error Prompt |
| --- | --- | --- |
| `hi-IN` | आपका काम और मजदूरी का रिकॉर्ड सुरक्षित रखा जाएगा। यह केवल आपकी मर्ज़ी से साझा होगा। क्या आप सहमत हैं? | आवाज़ साफ नहीं आई, कृपया फिर से बोलें। |
| `kn-IN` | ನಿಮ್ಮ ಕೆಲಸ ಮತ್ತು ವೇತನದ ದಾಖಲೆಯನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಇಡಲಾಗುವುದು. ನಿಮ್ಮ ಒಪ್ಪಿಗೆಯಿಂದ ಮಾತ್ರ ಹಂಚಿಕೊಳ್ಳಲಾಗುವುದು. ನೀವು ಒಪ್ಪುತ್ತೀರಾ? | ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ, ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಿ. |
| `bn-IN` | আপনার কাজ ও মজুরির হিসাব নিরাপদে রাখা হবে। কেবল আপনার অনুমতিতেই এটি শেয়ার করা হবে। আপনি কি রাজি? | কথা স্পষ্ট শোনা যায়নি, অনুগ্রহ করে আবার বলুন। |
| `en-IN` | Your work and wage record will be stored safely and shared only when you choose. Do you agree? | Could not hear clearly, please speak again. |

---

## 2. Read-Back Templates (`backend/voice/readback.py`)

### Worker Read-Back (warm, second person)
- **`hi-IN`**: `तारीख {date} को आपने {hours/days} {site} पर {contractor} के साथ काम किया। तय हुआ ₹{agreed}, मिले ₹{paid}, बाकी ₹{due}। क्या यह सही है?`
- **`kn-IN`**: `ದಿನಾಂಕ {date} ರಂದು ನೀವು {site} ನಲ್ಲಿ {contractor} ಅವರೊಂದಿಗೆ {hours/days} ಕೆಲಸ ಮಾಡಿದ್ದೀರಿ. ಒಪ್ಪಿದ ಹಣ ₹{agreed}, ಸಿಕ್ಕಿದ್ದು ₹{paid}, ಬಾಕಿ ₹{due}. ಇದು ಸರಿಯೇ?`
- **`bn-IN`**: `তারিখ {date}-এ আপনি {site}-এ {contractor}-এর সাথে {hours/days} কাজ করেছেন। ঠিক হয়েছে ₹{agreed}, পেয়েছেন ₹{paid}, বাকি ₹{due}। এটা কি ঠিক আছে?`
- **`en-IN`**: `On {date}, you worked {hours/days} at {site} with {contractor}. Agreed ₹{agreed}, paid ₹{paid}, due ₹{due}. Is this correct?`

### Contractor Read-Back (neutral, third person)
- **`hi-IN`**: `तारीख {date} को {site} पर {hours/days} काम का विवरण दर्ज हुआ है। तय रकम ₹{agreed}, भुगतान ₹{paid}, बकाया ₹{due}। क्या आप इसकी पुष्टि करते हैं?`
- **`kn-IN`**: `ದಿನಾಂಕ {date} ರಂದು {site} ನಲ್ಲಿ {hours/days} ಕೆಲಸದ ವಿವರ ದಾಖಲಾಗಿದೆ. ಒಪ್ಪಿದ ಮೊತ್ತ ₹{agreed}, ಪಾವತಿ ₹{paid}, ಬಾಕಿ ₹{due}. ನೀವು ಇದನ್ನು ದೃಢೀಕರಿಸುತ್ತೀರಾ?`
- **`bn-IN`**: `তারিখ {date}-এ {site}-এ {hours/days} কাজের হিসাব নথিভুক্ত হয়েছে। নির্ধারিত ₹{agreed}, পরিশোধ ₹{paid}, বাকি ₹{due}। আপনি কি এটি নিশ্চিত করছেন?`
- **`en-IN`**: `Work record for {date} at {site}: {hours/days} work. Agreed ₹{agreed}, paid ₹{paid}, due ₹{due}. Do you confirm this entry?`

---

## 3. Confirmation & Clarification Keyword Sets (`backend/voice/confirmation.py`)

- **Hindi (`hi-IN`)**
  - Yes: `हाँ`, `हां`, `हाँ जी`, `जी`, `ठीक है`, `सही है`, `बिल्कुल`, `मंजूर`, `सहमत`, `haan`, `han`, `hanji`, `haan ji`, `ji`, `theek hai`, `thik hai`, `sahi hai`, `bilkul`, `manzoor`, `sahmat`
  - No / Negation: `नहीं`, `ना`, `मत`, `गलत`, `बदलो`, `ठीक नहीं`, `सही नहीं`, `गलत है`, `नहीं है`, `nahi`, `nahin`, `na`, `mat`, `galat`, `badlo`, `theek nahi`, `sahi nahi`
  - Unclear: `पता नहीं`, `मालूम नहीं`, `समझ नहीं`, `दोबारा`, `फिर से`, `pata nahi`, `maloom nahi`, `dobara`, `phir se`
- **Kannada (`kn-IN`)**
  - Yes: `ಹೌದು`, `ಸರಿ`, `ಸರಿ ಇದೆ`, `ಸರಿಯಿದೆ`, `ಒಪ್ಪುತ್ತೇನೆ`, `ಒಪ್ಪಿದ್ದೇನೆ`, `haudu`, `howdu`, `houdu`, `sari`, `sari ide`, `sariyide`, `opputtene`
  - No / Negation: `ಇಲ್ಲ`, `ಅಲ್ಲ`, `ಬೇಡ`, `ತಪ್ಪು`, `ಬದಲಿಸಿ`, `ಸರಿ ಇಲ್ಲ`, `illa`, `alla`, `beda`, `tappu`, `badalisi`, `sari illa`, `tappu ide`
  - Unclear: `ಗೊತ್ತಿಲ್ಲ`, `ಮತ್ತೆ ಹೇಳಿ`, `ಅರ್ಥ ಆಗಲಿಲ್ಲ`, `gottilla`, `gottu illa`, `matte heli`
- **Bengali (`bn-IN`)**
  - Yes: `হ্যাঁ`, `হাঁ`, `ঠিক আছে`, `সঠিক`, `রাজি`, `অবশ্যই`, `hya`, `haan`, `ha`, `thik ache`, `thik achhe`, `shothik`, `raji`
  - No / Negation: `না`, `নয়`, `নেই`, `ভুল`, `বদলান`, `ঠিক নয়`, `ঠিক না`, `na`, `noy`, `nei`, `bhul`, `badlan`, `thik noy`, `thik nei`
  - Unclear: `জানি না`, `বুঝিনি`, `আবার বলুন`, `jani na`, `bujhini`, `abar bolun`

---

## 4. Number-Word Tables & Units to Verify (`backend/voice/normalise.py`)

### Place Values, Currency, Hours, Months
- **Currency**: `रुपये / पैसे` (`hi`), `ರೂಪಾಯಿ / ಪೈಸೆ` (`kn`), `টাকা / পয়সা` (`bn`), `rupees / paise` (`en-IN`)
- **Hours**: `घंटे` (`hi`), `ಗಂಟೆ` (`kn`), `ঘণ্টা` (`bn`), `hours` (`en-IN`)
- **Place Values**:
  - `hi-IN`: `सौ`, `हज़ार`, `लाख`, `करोड़`
  - `kn-IN`: `ನೂರು` (+ compound hundreds `ಇನ್ನೂರು`..`ಒಂಬೈನೂರು`), `ಸಾವಿರ`, `ಲಕ್ಷ`, `ಕೋಟಿ`
  - `bn-IN`: `একশো` / `শো`, `হাজার`, `লাখ`, `কোটি`
  - `en-IN`: `hundred`, `thousand`, `lakh`, `crore`

### Irregular 0–99 Lookup Tables (Verify Pronunciation & Spelling)
- **Hindi (`HI_0_99`)**: `शून्य`..`निन्यानवे` (specifically check 29 `उनतीस`, 39 `उनतालीस`, 49 `उनचास`, 59 `उनसठ`, 69 `उनहत्तर`, 79 `उनासी`, 89 `नवासी`, 99 `निन्यानवे`, and 37/47/57/67/77/87 `सैंतीस`/`सैंतालीस`/`सत्तावन`/`सड़सठ`/`सतहत्तर`/`सत्तासी`).
- **Kannada (`KN_0_99`)**: `ಸೊನ್ನೆ`..`ತೊಂಬತ್ತೊಂಬತ್ತು` (verify sandhi joins for 21–99, e.g., `ಇಪ್ಪತ್ತೊಂದು`..`ತೊಂಬತ್ತೊಂಬತ್ತು`, and hundreds `ಇನ್ನೂರು`, `ಮುನ್ನೂರು`, `ನಾನ್ನೂರು`, `ಐನೂರು`, `ಆರುನೂರು`, `ಏಳುನೂರು`, `ಎಂಟುನೂರು`, `ಒಂಬೈನೂರು`).
- **Bengali (`BN_0_99`)**: `শূন্য`..`নিরানব্বই` (specifically check 19 `উনিশ`, 29 `ঊনত্রিশ`, 39 `ঊনচল্লিশ`, 49 `ঊনপঞ্চাশ`, 59 `ঊনষাট`, 69 `ঊনসত্তর`, 79 `ঊনাশি`, 89 `ঊননব্বই`, 99 `নিরানব্বই`, and 100 `একশো`).

> **Reviewer sign-off required before pilot**: Confirm TTS speaks all sample read-backs clearly in Gnani `timbre-v3.0` (`Shivani` / `Avinash`) at speed `0.9`.

