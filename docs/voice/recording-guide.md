# Volunteer Voice Recording Script & Labelling Guide (`docs/voice/recording-guide.md`)

Guide for Developer B and volunteers to record **200 evaluation utterances** (50 per language across `hi-IN`, `kn-IN`, `bn-IN`, `en-IN`) without storing sensitive personal information.

---

## 1. Consent Form Wording (Read & Agree Before Recording)

> **Volunteer Consent Text (English — translate/read in volunteer's language):**
> *"I agree to record short sample voice clips of simulated daily-wage work entries to help test and improve the Saakshi speech-to-text and extraction system. I understand these clips are test samples (not real wage disputes), should not include real phone numbers or full legal names, may be processed by Gnani speech APIs (and Google Gemini if cloud extraction is enabled), and can be deleted at any time upon request."*

*(Do not include real contractor full names, real phone numbers, Aadhaar/IDs, or personal financial details in test recordings.)*

---

## 2. Target Set Size & Conditions (200 Total)

Record **50 utterances per language** (`hi-IN`, `kn-IN`, `bn-IN`, `en-IN`), split evenly:
- **25 `clean`**: quiet indoor room, phone held 15–25 cm from mouth.
- **25 `noisy`**: realistic background fan, street traffic, or construction/chatter audio.

### Prompt Mix per 50-Clip Language Set
| Category | Count (Clean / Noisy) | Example Prompts |
| --- | --- | --- |
| `complete` | 13 / 12 | *"Aaj Whitefield site pe 8 ghante kaam kiya, Raju bhaiya ne 800 ka bola, 300 diye."* |
| `kal_date` | 4 / 4 | *"Kal Hebbal site pe ek din kaam kiya, Kiran ne 750 bola, 250 diya."* |
| `edge_case` | 3 / 4 | Missing paid (*"600 तय हुए"*), paid > agreed (*"500 tay, 700 mila"*), stated due mismatch (*"800 bola 300 diya baaki 600"*) |
| `code_mixed` | 3 / 2 | *"Ninney Jayanagar site alli 8 hours plumbing work maadide, Mahesh sir 1000 fix maadi 400 kottaru."* |
| `confirm` | 2 / 3 | *"Haan theek hai"*, *"Nahi 400 nahi 500 diye"*, *"Pata nahi phir se bolo"* |

---

## 3. File Naming & Format Convention

- Save audio clips locally (git-ignored folder, e.g., `data/eval_audio/`) using:
  `<language>_<noise_condition>_<3-digit-id>.wav`
  Examples:
  - `hi-IN_clean_001.wav`
  - `hi-IN_noisy_026.wav`
  - `kn-IN_clean_001.wav`
  - `bn-IN_noisy_042.wav`
  - `en-IN_clean_010.wav`
- Recommended recording format: **16 kHz mono 16-bit PCM WAV** (other formats like `.mp3`/`.m4a`/`.ogg` can be converted to 16 kHz mono WAV before running `run_eval.py`).

---

## 4. Filling `docs/voice/eval-labels-template.csv`

Copy `docs/voice/eval-labels-template.csv` to a local working CSV (e.g. `data/eval_labels.csv`) and fill one row per recorded clip:
- Leave empty cells blank for fields not spoken (e.g., `expected_paid_inr` empty on a `missing_paid` clip).
- `expected_work_date_offset`: `0` for today, `-1` for yesterday (`kal`/`ninney`), `-2` for day before yesterday.
- `expected_due_inr`: leave blank when `expected_paid_inr > expected_agreed_inr` or when either amount is missing.

