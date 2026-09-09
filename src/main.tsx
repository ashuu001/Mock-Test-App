import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Clock3, Download, FileUp, RotateCcw, Save, Check, X, Minus, AlertTriangle, Trophy, ClipboardCheck, LoaderCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
import './styles.css';

type Answer = 'A' | 'B' | 'C' | 'D' | null;
type Series = 'A' | 'B' | 'C' | 'D';
type Evaluation = 'correct' | 'wrong' | 'unattempted' | null;
type Phase = 'setup' | 'test' | 'marking' | 'result';

type State = {
  examName: string;
  series: Series;
  totalQuestions: number;
  durationMinutes: number;
  startedAt: number | null;
  elapsedBeforePause: number;
  answers: Answer[];
  evaluations: Evaluation[];
  answerKey: Answer[];
  answerKeySource: string;
  phase: Phase;
};

const DEFAULT_TOTAL = 120;
const DEFAULT_DURATION_MINUTES = 120;
const MAX_MARKS = 100;
const STORAGE_KEY = 'omr-mock-test-v2';

const blankState = (): State => ({
  examName: '',
  series: 'A',
  totalQuestions: DEFAULT_TOTAL,
  durationMinutes: DEFAULT_DURATION_MINUTES,
  startedAt: null,
  elapsedBeforePause: 0,
  answers: Array(DEFAULT_TOTAL).fill(null),
  evaluations: Array(DEFAULT_TOTAL).fill(null),
  answerKey: Array(DEFAULT_TOTAL).fill(null),
  answerKeySource: '',
  phase: 'setup'
});

function normalizeState(value: any): State {
  const totalQuestions = Math.min(500, Math.max(1, Number(value?.totalQuestions) || DEFAULT_TOTAL));
  const durationMinutes = Math.min(600, Math.max(1, Number(value?.durationMinutes) || DEFAULT_DURATION_MINUTES));
  const answers = Array.isArray(value?.answers) ? value.answers.slice(0, totalQuestions) : [];
  const evaluations = Array.isArray(value?.evaluations) ? value.evaluations.slice(0, totalQuestions) : [];
  const answerKey = Array.isArray(value?.answerKey) ? value.answerKey.slice(0, totalQuestions) : [];
  return {
    ...blankState(),
    ...value,
    series: ['A','B','C','D'].includes(value?.series) ? value.series : 'A',
    totalQuestions,
    durationMinutes,
    answers: [...answers, ...Array(totalQuestions - answers.length).fill(null)],
    evaluations: [...evaluations, ...Array(totalQuestions - evaluations.length).fill(null)],
    answerKey: [...answerKey, ...Array(totalQuestions - answerKey.length).fill(null)],
    answerKeySource: typeof value?.answerKeySource === 'string' ? value.answerKeySource : ''
  };
}

function loadLocal(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch { return null; }
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function scoreOf(evals: Evaluation[], totalQuestions: number) {
  const markPerQuestion = MAX_MARKS / totalQuestions;
  const negativePerQuestion = markPerQuestion / 3;
  const correct = evals.filter(x => x === 'correct').length;
  const wrong = evals.filter(x => x === 'wrong').length;
  const unattempted = totalQuestions - correct - wrong;
  const positive = correct * markPerQuestion;
  const negative = wrong * negativePerQuestion;
  return { correct, wrong, unattempted, positive, negative, score: positive - negative, markPerQuestion, negativePerQuestion };
}

function download(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function App() {
  const [state, setState] = useState<State>(() => loadLocal() ?? blankState());
  const [now, setNow] = useState(Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const answerKeyRef = useRef<HTMLInputElement>(null);
  const [showReset, setShowReset] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyStatus, setKeyStatus] = useState('');
  const [detectedSeries, setDetectedSeries] = useState<Series | null>(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    if (state.phase === 'test' && state.startedAt) {
      const id = window.setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(id);
    }
  }, [state.phase, state.startedAt]);

  const durationSeconds = state.durationMinutes * 60;
  const elapsed = state.startedAt ? state.elapsedBeforePause + (now - state.startedAt) / 1000 : state.elapsedBeforePause;
  const remaining = Math.max(0, durationSeconds - elapsed);

  useEffect(() => {
    if (state.phase === 'test' && remaining <= 0) {
      setState(s => ({ ...s, phase: 'marking', startedAt: null, elapsedBeforePause: state.durationMinutes * 60 }));
    }
  }, [remaining, state.phase]);

  const stats = useMemo(() => scoreOf(state.evaluations, state.totalQuestions), [state.evaluations, state.totalQuestions]);

  const updateAnswer = (i: number, answer: Answer) => {
    setState(s => { const a = [...s.answers]; a[i] = answer; return { ...s, answers: a }; });
  };
  const updateEval = (i: number, ev: Evaluation) => {
    setState(s => { const e = [...s.evaluations]; e[i] = e[i] === ev ? null : ev; return { ...s, evaluations: e }; });
  };
  const start = () => {
    setDetectedSeries(null);
    setKeyStatus('');
    setState(s => ({
    ...s,
    phase: 'test',
    startedAt: Date.now(),
    elapsedBeforePause: 0,
    answers: Array(s.totalQuestions).fill(null),
    evaluations: Array(s.totalQuestions).fill(null),
    answerKey: Array(s.totalQuestions).fill(null),
    answerKeySource: ''
  }));
  };
  const finishTest = () => setState(s => ({ ...s, phase: 'marking', startedAt: null, elapsedBeforePause: Math.min(s.durationMinutes * 60, elapsed) }));
  const finishMarking = () => setState(s => ({ ...s, phase: 'result' }));
  const reset = () => { localStorage.removeItem(STORAGE_KEY); setState(blankState()); setShowReset(false); };

  const saveFile = () => {
    const payload = { ...state, savedAt: new Date().toISOString(), scoring: { totalQuestions: state.totalQuestions, maxMarks: MAX_MARKS, negativeFraction: '1/3' } };
    download(`${(state.examName || 'mock-test').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-answers.json`, JSON.stringify(payload, null, 2));
  };
  const exportResult = () => {
    const payload = { examName: state.examName, totalQuestions: state.totalQuestions, durationMinutes: state.durationMinutes, maxMarks: MAX_MARKS, correct: stats.correct, wrong: stats.wrong, unattempted: stats.unattempted, positiveMarks: Number(stats.positive.toFixed(6)), negativeMarks: Number(stats.negative.toFixed(6)), score: Number(stats.score.toFixed(6)), answers: state.answers, evaluations: state.evaluations, answerKey: state.answerKey, answerKeySource: state.answerKeySource };
    download(`${(state.examName || 'mock-test').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-result.json`, JSON.stringify(payload, null, 2));
  };
  const loadFile = (file: File) => {
    const reader = new FileReader(); reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (!Array.isArray(imported.answers)) throw new Error('Invalid file');
        setState(normalizeState({ ...imported, phase: imported.phase ?? 'setup' }));
      } catch { alert('That file is not a valid OMR Mock Test save file.'); }
    }; reader.readAsText(file);
  };


  const applyAnswerKey = (key: Answer[], source: string) => {
    const normalized = Array.from({ length: state.totalQuestions }, (_, i) => key[i] ?? null);
    const evaluations: Evaluation[] = normalized.map((correctAnswer, i) => {
      if (!correctAnswer) return null;
      const userAnswer = state.answers[i];
      if (!userAnswer) return 'unattempted';
      return userAnswer === correctAnswer ? 'correct' : 'wrong';
    });
    const parsed = normalized.filter(Boolean).length;
    setState(s => ({ ...s, answerKey: normalized, answerKeySource: source, evaluations }));
    return parsed;
  };

  const isolateSeriesSection = (text: string, series: Series) => {
    const normalized = text.replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
    const header = new RegExp(`SERIES\\s*[-–—:]?\\s*${series}\\b`, 'i');
    const nextHeader = /SERIES\\s*[-–—:]?\\s*[ABCD]\\b/gi;
    const match = header.exec(normalized);
    if (!match) return normalized;
    nextHeader.lastIndex = match.index + match[0].length;
    const next = nextHeader.exec(normalized);
    return normalized.slice(match.index + match[0].length, next ? next.index : normalized.length);
  };

  const extractAnswerPairs = (text: string, series: Series): Answer[] => {
    const result: Answer[] = Array(state.totalQuestions).fill(null);
    const cleaned = isolateSeriesSection(text, series)
      .replace(/[|]/g, 'I')
      .replace(/[“”‘’]/g, '')
      .replace(/\r/g, '\n');
    const patterns = [
      /(?:^|[\n;])\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[\)\].:\-–—]\s*([ABCD])(?=\s|$|[,;])/gi,
      /(?:^|[\n])\s*(?:Q(?:uestion)?\s*)?(\d{1,3})\s+([ABCD])(?:\s|$)/gi,
      /(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[-:]\s*([ABCD])\b/gi
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(cleaned)) !== null) {
        const q = Number(m[1]), a = m[2].toUpperCase() as Answer;
        if (q >= 1 && q <= state.totalQuestions && !result[q - 1]) result[q - 1] = a;
      }
    }
    return result;
  };

  const readAnswerKey = async (file: File): Promise<{ key: Answer[]; source: string; detectedSeries: Series | null }> => {
    let text = '';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str || '').join(' ') + '\n';
      }
      let key = extractAnswerPairs(text, state.series);
      let usedSeries: Series | null = /SERIES\s*[-–—:]?\s*[ABCD]\b/i.test(text) ? state.series : null;
      if (key.filter(Boolean).length < Math.min(3, state.totalQuestions)) {
        const worker = await createWorker('eng');
        try {
          let ocrText = '';
          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const viewport = page.getViewport({ scale: 1.8 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const { data } = await worker.recognize(canvas);
            ocrText += data.text + '\n';
          }
          key = extractAnswerPairs(ocrText, state.series);
          if (/SERIES\s*[-–—:]?\s*[ABCD]\b/i.test(ocrText)) usedSeries = state.series;
        } finally {
          await worker.terminate();
        }
      }
      return { key, source: file.name, detectedSeries: usedSeries };
    }
    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(file);
      const text = data.text;
      return { key: extractAnswerPairs(text, state.series), source: file.name, detectedSeries: /SERIES\s*[-–—:]?\s*[ABCD]\b/i.test(text) ? state.series : null };
    } finally {
      await worker.terminate();
    }
  };

  const uploadAnswerKey = async (file: File) => {
    setKeyLoading(true);
    setKeyStatus('Reading answer key…');
    try {
      const { key, source, detectedSeries: foundSeries } = await readAnswerKey(file);
      setDetectedSeries(foundSeries);
      const parsed = applyAnswerKey(key, source);
      if (!parsed) {
        setKeyStatus('No answers were detected. Use a key with entries like 1-A, 2-B, 3-C.');
      } else {
        setKeyStatus(`${parsed}/${state.totalQuestions} answers detected from ${source}. Results were calculated automatically.`);
      }
    } catch (error) {
      console.error(error);
      setKeyStatus('Could not read that file. Try a clear image/PDF with question numbers and A/B/C/D answers.');
    } finally {
      setKeyLoading(false);
    }
  };

  const answeredCount = state.answers.filter(Boolean).length;
  const evaluatedCount = state.evaluations.filter(Boolean).length;

  if (state.phase === 'setup') return <Setup state={state} setState={setState} start={start} load={() => fileRef.current?.click()} save={saveFile} reset={() => setShowReset(true)} fileRef={fileRef} loadFile={loadFile} showReset={showReset} setShowReset={setShowReset} doReset={reset} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="brandIcon"><ClipboardCheck size={20}/></div><div><strong>OMR Mock Test</strong><span>{state.examName || 'Untitled Test'}</span></div></div>
        <div className="topActions">
          {state.phase === 'test' && <div className={`timer ${remaining <= 600 && state.durationMinutes * 60 > 600 ? 'danger' : ''}`}><Clock3 size={18}/><b>{formatTime(remaining)}</b></div>}
          {state.phase === 'marking' && <div className="phasePill">MARKING MODE</div>}
          {state.phase === 'result' && <div className="phasePill">RESULT</div>}
          <button className="iconBtn" title="Save to computer" onClick={saveFile}><Save size={18}/></button>
          <button className="iconBtn" title="Load saved sheet" onClick={() => fileRef.current?.click()}><FileUp size={18}/></button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])}/>
          <button className="iconBtn" title="Reset" onClick={() => setShowReset(true)}><RotateCcw size={18}/></button>
        </div>
      </header>

      {state.phase === 'test' && <TestView state={state} updateAnswer={updateAnswer} answeredCount={answeredCount} finish={finishTest} remaining={remaining} />}
      {state.phase === 'marking' && <MarkingView state={state} setState={setState} updateEval={updateEval} evaluatedCount={evaluatedCount} stats={stats} finish={finishMarking} answerKeyRef={answerKeyRef} keyLoading={keyLoading} keyStatus={keyStatus} uploadAnswerKey={uploadAnswerKey} detectedSeries={detectedSeries} />}
      {state.phase === 'result' && <ResultView state={state} stats={stats} exportResult={exportResult} backToMarking={() => setState(s => ({...s, phase:'marking'}))} />}

      {showReset && <div className="modalBackdrop"><div className="modal"><AlertTriangle size={28}/><h3>Reset this test?</h3><p>This will permanently clear the current local answer sheet from this browser.</p><div className="modalActions"><button className="secondary" onClick={() => setShowReset(false)}>Cancel</button><button className="dangerBtn" onClick={reset}>Reset Test</button></div></div></div>}
    </div>
  );
}

function Setup({ state, setState, start, load, save, reset, fileRef, loadFile, showReset, setShowReset, doReset }: any) {
  const markPerQuestion = MAX_MARKS / state.totalQuestions;
  const negativePerQuestion = markPerQuestion / 3;
  const updateConfig = (key: 'totalQuestions' | 'durationMinutes', value: number) => {
    const safeValue = key === 'totalQuestions'
      ? Math.min(500, Math.max(1, Math.floor(value || 1)))
      : Math.min(600, Math.max(1, Math.floor(value || 1)));
    setState((s: State) => {
      if (key === 'totalQuestions') {
        return {
          ...s,
          totalQuestions: safeValue,
          answers: Array(safeValue).fill(null),
          evaluations: Array(safeValue).fill(null),
          answerKey: Array(safeValue).fill(null),
          answerKeySource: '',
          phase: 'setup'
        };
      }
      return { ...s, durationMinutes: safeValue, phase: 'setup' };
    });
  };
  return <div className="setupPage">
    <div className="setupCard">
      <div className="heroIcon"><ClipboardCheck size={32}/></div>
      <div className="eyebrow">PERSONAL MOCK TEST WORKSPACE</div>
      <h1>OMR-style mock test</h1>
      <p className="muted">Customize the number of questions and time limit before starting. The maximum score stays at 100 and negative marking remains 1/3.</p>
      <label className="fieldLabel">Exam name</label>
      <input className="examInput" placeholder="Enter exam name" value={state.examName} onChange={e => setState((s: State) => ({...s, examName: e.target.value}))}/>
      <label className="fieldLabel seriesLabel">Answer-key series</label>
      <div className="seriesPicker">
        {(['A','B','C','D'] as Series[]).map(series => <button type="button" key={series} className={state.series === series ? 'active' : ''} onClick={() => setState((s: State) => ({...s, series}))}>Series {series}</button>)}
      </div>
      <span className="fieldHint">Choose the same series printed on the official answer key. This is important because each series has different answers.</span>
      <div className="customConfig">
        <div className="configField">
          <label className="fieldLabel">Number of questions</label>
          <input className="examInput" type="number" min="1" max="500" step="1" value={state.totalQuestions} onChange={e => updateConfig('totalQuestions', Number(e.target.value))}/>
          <span className="fieldHint">1–500 questions</span>
        </div>
        <div className="configField">
          <label className="fieldLabel">Time limit (minutes)</label>
          <input className="examInput" type="number" min="1" max="600" step="1" value={state.durationMinutes} onChange={e => updateConfig('durationMinutes', Number(e.target.value))}/>
          <span className="fieldHint">1–600 minutes</span>
        </div>
      </div>
      <div className="configGrid">
        <div><b>{state.totalQuestions}</b><span>Questions</span></div>
        <div><b>100</b><span>Maximum marks</span></div>
        <div><b>1/3</b><span>Negative marking</span></div>
        <div><b>{formatTime(state.durationMinutes * 60)}</b><span>Time limit</span></div>
      </div>
      <div className="scoringNote"><b>Scoring:</b> Correct +{markPerQuestion.toFixed(6)} · Wrong −{negativePerQuestion.toFixed(6)} · Unattempted 0 · Final score out of 100</div>
      <button className="primary big" onClick={start}>Start Test <span>→</span></button>
      <div className="setupLinks"><button onClick={load}><FileUp size={16}/> Load saved answer sheet</button><button onClick={save}><Download size={16}/> Save current sheet</button><button onClick={reset}><RotateCcw size={16}/> Reset</button></div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e: any) => e.target.files?.[0] && loadFile(e.target.files[0])}/>
      {showReset && <div className="modalBackdrop"><div className="modal"><AlertTriangle size={28}/><h3>Reset this test?</h3><p>This will permanently clear the current local answer sheet.</p><div className="modalActions"><button className="secondary" onClick={() => setShowReset(false)}>Cancel</button><button className="dangerBtn" onClick={doReset}>Reset Test</button></div></div></div>}
    </div>
  </div>
}

function TestView({ state, updateAnswer, answeredCount, finish, remaining }: any) {
  return <main className="content">
    <div className="infoRow"><div><h2>Answer Sheet</h2><p>Mark the option you selected in the actual exam. You can change it anytime.</p></div><div className="progressBox"><b>{answeredCount}/{state.totalQuestions}</b><span>answered</span></div></div>
    {remaining <= 600 && state.durationMinutes * 60 > 600 && <div className="warning"><AlertTriangle size={18}/> Less than 10 minutes remaining. Your sheet will auto-lock at 00:00:00.</div>}
    <div className="omrCard"><div className="tableHeader"><span>Q.NO.</span><span>A</span><span>B</span><span>C</span><span>D</span><span>STATUS</span></div>
      <div className="rows">{state.answers.map((answer: Answer, i: number) => <div className={`omrRow ${answer ? 'selected' : ''}`} key={i}><span className="qno">{String(i+1).padStart(3,'0')}</span>{(['A','B','C','D'] as const).map(opt => <button key={opt} className={`bubble ${answer===opt ? 'on' : ''}`} onClick={() => updateAnswer(i, answer===opt ? null : opt)}>{opt}</button>)}<span className="statusText">{answer ? `Marked ${answer}` : 'Unanswered'}</span></div>)}</div>
    </div>
    <div className="bottomBar"><div><b>{answeredCount}</b> answered <span>·</span> <b>{state.totalQuestions-answeredCount}</b> unanswered</div><button className="primary" onClick={finish}>Finish Test <Check size={17}/></button></div>
  </main>
}

function MarkingView({ state, updateEval, evaluatedCount, stats, finish, answerKeyRef, keyLoading, keyStatus, uploadAnswerKey }: any) {
  return <main className="content">
    <div className="infoRow"><div><h2>Automatic Marking</h2><p>Upload the official answer key as a PDF or clear picture. The app reads the key, compares it with your answers, and calculates the score automatically.</p></div><div className="progressBox"><b>{evaluatedCount}/{state.totalQuestions}</b><span>evaluated</span></div></div>
    <div className="answerKeyPanel">
      <div className="answerKeyIcon"><ClipboardCheck size={21}/></div>
      <div className="answerKeyCopy">
        <strong>Official answer key</strong>
        <span>Supports the tabular UPSC-style PDF/image format with Series A, B, C or D.</span>
        <small>Selected key series: <b>{state.series}</b>{state.answerKeySource ? ` · Loaded: ${state.answerKeySource}` : ''}</small>
      </div>
      <button className="primary keyUpload" disabled={keyLoading} onClick={() => answerKeyRef.current?.click()}>
        {keyLoading ? <><LoaderCircle size={17} className="spin"/> Reading…</> : <><FileUp size={17}/> Upload Answer Key</>}
      </button>
      <input ref={answerKeyRef} type="file" accept=".pdf,image/*" hidden onChange={(e: any) => e.target.files?.[0] && uploadAnswerKey(e.target.files[0])}/>
    </div>
    {detectedSeries && <div className="keyStatus">Detected/used Series {detectedSeries}. The 120-question table for that series was used for scoring.</div>}
    {keyStatus && <div className={`keyStatus ${keyStatus.startsWith('No ') || keyStatus.startsWith('Could not') ? 'error' : ''}`}>{keyStatus}</div>}
    <div className="scoringNote"><b>Scoring:</b> Correct +{stats.markPerQuestion.toFixed(4)} · Wrong −{stats.negativePerQuestion.toFixed(4)} · Unattempted 0 · Final score out of 100</div>
    <div className="legend"><span><i className="dot correct"/> Correct</span><span><i className="dot wrong"/> Wrong</span><span><i className="dot unattempted"/> Unattempted</span></div>
    <div className="markGrid">{state.evaluations.map((ev: Evaluation, i: number) => <div className={`markCard ${ev || ''}`} key={i}><div className="markHead"><b>Q {i+1}</b><span>Your: <strong>{state.answers[i] ?? '—'}</strong> · Key: <strong>{state.answerKey?.[i] ?? '—'}</strong></span></div><div className="markButtons"><button className={ev==='correct'?'active':''} onClick={() => updateEval(i,'correct')}><Check size={16}/> Correct</button><button className={ev==='wrong'?'active':''} onClick={() => updateEval(i,'wrong')}><X size={16}/> Wrong</button><button className={ev==='unattempted'?'active':''} onClick={() => updateEval(i,'unattempted')}><Minus size={16}/> Unattempted</button></div></div>)}</div>
    <div className="bottomBar"><div><b>{stats.correct}</b> correct <span>·</span> <b>{stats.wrong}</b> wrong <span>·</span> <b>{stats.unattempted}</b> unattempted</div><button className="primary" onClick={finish}>Calculate Result <Trophy size={17}/></button></div>
  </main>
}

function ResultView({ state, stats, exportResult, backToMarking }: any) {
  return <main className="content resultPage">
    <div className="resultHero"><div className="resultIcon"><Trophy size={30}/></div><div className="eyebrow">TEST COMPLETE</div><h1>{stats.score.toFixed(2)} <small>/ 100</small></h1><p>{state.examName || 'Mock Test'} · {state.totalQuestions} questions · {formatTime(state.durationMinutes * 60)} limit</p></div>
    <div className="resultGrid"><div className="resultStat correct"><span>Correct</span><b>{stats.correct}</b><small>+{stats.positive.toFixed(2)} marks</small></div><div className="resultStat wrong"><span>Wrong</span><b>{stats.wrong}</b><small>−{stats.negative.toFixed(2)} marks</small></div><div className="resultStat"><span>Unattempted</span><b>{stats.unattempted}</b><small>0 marks</small></div></div>
    <div className="breakdown"><div><span>Positive marks</span><b>+{stats.positive.toFixed(2)}</b></div><div><span>Negative marks</span><b>−{stats.negative.toFixed(2)}</b></div><div><span>Final score</span><b>{stats.score.toFixed(2)} / 100</b></div></div>
    <div className="resultActions"><button className="secondary" onClick={backToMarking}>Review / edit marking</button><button className="primary" onClick={exportResult}><Download size={17}/> Export result</button></div>
    <div className="reviewGrid">{state.evaluations.map((ev: Evaluation, i: number) => <div className={`reviewCell ${ev || 'pending'}`} key={i}><b>{String(i+1).padStart(3,'0')}</b><span>{state.answers[i] ?? '—'}</span><i>{ev==='correct'?'✓':ev==='wrong'?'✕':ev==='unattempted'?'—':'?'}</i></div>)}</div>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />);
