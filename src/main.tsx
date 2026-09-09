import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Clock3, Download, FileUp, RotateCcw, Save, Check, X, Minus, AlertTriangle, Trophy, ClipboardCheck } from 'lucide-react';
import './styles.css';

type Answer = 'A' | 'B' | 'C' | 'D' | null;
type Evaluation = 'correct' | 'wrong' | 'unattempted' | null;
type Phase = 'setup' | 'test' | 'marking' | 'result';

type State = {
  examName: string;
  startedAt: number | null;
  elapsedBeforePause: number;
  answers: Answer[];
  evaluations: Evaluation[];
  phase: Phase;
};

const TOTAL = 120;
const MAX_MARKS = 100;
const DURATION = 2 * 60 * 60;
const MARK_PER_Q = MAX_MARKS / TOTAL;
const NEGATIVE_PER_Q = MARK_PER_Q / 3;
const STORAGE_KEY = 'omr-mock-test-v1';

const blankState = (): State => ({
  examName: '', startedAt: null, elapsedBeforePause: 0,
  answers: Array(TOTAL).fill(null), evaluations: Array(TOTAL).fill(null), phase: 'setup'
});

function loadLocal(): State | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function scoreOf(evals: Evaluation[]) {
  const correct = evals.filter(x => x === 'correct').length;
  const wrong = evals.filter(x => x === 'wrong').length;
  const unattempted = TOTAL - correct - wrong;
  const positive = correct * MARK_PER_Q;
  const negative = wrong * NEGATIVE_PER_Q;
  return { correct, wrong, unattempted, positive, negative, score: positive - negative };
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
  const [showReset, setShowReset] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    if (state.phase === 'test' && state.startedAt) {
      const id = window.setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(id);
    }
  }, [state.phase, state.startedAt]);

  const elapsed = state.startedAt ? state.elapsedBeforePause + (now - state.startedAt) / 1000 : state.elapsedBeforePause;
  const remaining = Math.max(0, DURATION - elapsed);

  useEffect(() => {
    if (state.phase === 'test' && remaining <= 0) {
      setState(s => ({ ...s, phase: 'marking', startedAt: null, elapsedBeforePause: DURATION }));
    }
  }, [remaining, state.phase]);

  const stats = useMemo(() => scoreOf(state.evaluations), [state.evaluations]);

  const updateAnswer = (i: number, answer: Answer) => {
    setState(s => { const a = [...s.answers]; a[i] = answer; return { ...s, answers: a }; });
  };
  const updateEval = (i: number, ev: Evaluation) => {
    setState(s => { const e = [...s.evaluations]; e[i] = e[i] === ev ? null : ev; return { ...s, evaluations: e }; });
  };
  const start = () => setState(s => ({ ...s, phase: 'test', startedAt: Date.now() }));
  const finishTest = () => setState(s => ({ ...s, phase: 'marking', startedAt: null, elapsedBeforePause: Math.min(DURATION, elapsed) }));
  const finishMarking = () => setState(s => ({ ...s, phase: 'result' }));
  const reset = () => { localStorage.removeItem(STORAGE_KEY); setState(blankState()); setShowReset(false); };

  const saveFile = () => {
    const payload = { ...state, savedAt: new Date().toISOString(), scoring: { totalQuestions: TOTAL, maxMarks: MAX_MARKS, negativeFraction: '1/3' } };
    download(`${(state.examName || 'mock-test').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-answers.json`, JSON.stringify(payload, null, 2));
  };
  const exportResult = () => {
    const payload = { examName: state.examName, totalQuestions: TOTAL, maxMarks: MAX_MARKS, correct: stats.correct, wrong: stats.wrong, unattempted: stats.unattempted, positiveMarks: Number(stats.positive.toFixed(6)), negativeMarks: Number(stats.negative.toFixed(6)), score: Number(stats.score.toFixed(6)), answers: state.answers, evaluations: state.evaluations };
    download(`${(state.examName || 'mock-test').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}-result.json`, JSON.stringify(payload, null, 2));
  };
  const loadFile = (file: File) => {
    const reader = new FileReader(); reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (!Array.isArray(imported.answers) || imported.answers.length !== TOTAL) throw new Error('Invalid file');
        setState({ ...blankState(), ...imported, phase: imported.phase ?? 'setup' });
      } catch { alert('That file is not a valid OMR Mock Test save file.'); }
    }; reader.readAsText(file);
  };

  const answeredCount = state.answers.filter(Boolean).length;
  const evaluatedCount = state.evaluations.filter(Boolean).length;

  if (state.phase === 'setup') return <Setup state={state} setState={setState} start={start} load={() => fileRef.current?.click()} save={saveFile} reset={() => setShowReset(true)} fileRef={fileRef} loadFile={loadFile} showReset={showReset} setShowReset={setShowReset} doReset={reset} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><div className="brandIcon"><ClipboardCheck size={20}/></div><div><strong>OMR Mock Test</strong><span>{state.examName || 'Untitled Test'}</span></div></div>
        <div className="topActions">
          {state.phase === 'test' && <div className={`timer ${remaining <= 600 ? 'danger' : ''}`}><Clock3 size={18}/><b>{formatTime(remaining)}</b></div>}
          {state.phase === 'marking' && <div className="phasePill">MARKING MODE</div>}
          {state.phase === 'result' && <div className="phasePill">RESULT</div>}
          <button className="iconBtn" title="Save to computer" onClick={saveFile}><Save size={18}/></button>
          <button className="iconBtn" title="Load saved sheet" onClick={() => fileRef.current?.click()}><FileUp size={18}/></button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])}/>
          <button className="iconBtn" title="Reset" onClick={() => setShowReset(true)}><RotateCcw size={18}/></button>
        </div>
      </header>

      {state.phase === 'test' && <TestView state={state} updateAnswer={updateAnswer} answeredCount={answeredCount} finish={finishTest} remaining={remaining} />}
      {state.phase === 'marking' && <MarkingView state={state} updateEval={updateEval} evaluatedCount={evaluatedCount} stats={stats} finish={finishMarking} />}
      {state.phase === 'result' && <ResultView state={state} stats={stats} exportResult={exportResult} backToMarking={() => setState(s => ({...s, phase:'marking'}))} />}

      {showReset && <div className="modalBackdrop"><div className="modal"><AlertTriangle size={28}/><h3>Reset this test?</h3><p>This will permanently clear the current local answer sheet from this browser.</p><div className="modalActions"><button className="secondary" onClick={() => setShowReset(false)}>Cancel</button><button className="dangerBtn" onClick={reset}>Reset Test</button></div></div></div>}
    </div>
  );
}

function Setup({ state, setState, start, load, save, reset, fileRef, loadFile, showReset, setShowReset, doReset }: any) {
  return <div className="setupPage">
    <div className="setupCard">
      <div className="heroIcon"><ClipboardCheck size={32}/></div>
      <div className="eyebrow">PERSONAL MOCK TEST WORKSPACE</div>
      <h1>OMR-style mock test</h1>
      <p className="muted">Take a 120-question test with a 2-hour countdown, then self-check against your answer key and mark each question correct, wrong, or unattempted.</p>
      <label className="fieldLabel">Exam name</label>
      <input className="examInput" placeholder="Enter exam name" value={state.examName} onChange={e => setState((s: State) => ({...s, examName: e.target.value}))}/>
      <div className="configGrid"><div><b>120</b><span>Questions</span></div><div><b>100</b><span>Maximum marks</span></div><div><b>1/3</b><span>Negative marking</span></div><div><b>2:00:00</b><span>Time limit</span></div></div>
      <div className="scoringNote"><b>Scoring:</b> Correct +{MARK_PER_Q.toFixed(6)} · Wrong −{NEGATIVE_PER_Q.toFixed(6)} · Unattempted 0</div>
      <button className="primary big" onClick={start}>Start Test <span>→</span></button>
      <div className="setupLinks"><button onClick={load}><FileUp size={16}/> Load saved answer sheet</button><button onClick={save}><Download size={16}/> Save current sheet</button><button onClick={reset}><RotateCcw size={16}/> Reset</button></div>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e: any) => e.target.files?.[0] && loadFile(e.target.files[0])}/>
      {showReset && <div className="modalBackdrop"><div className="modal"><AlertTriangle size={28}/><h3>Reset this test?</h3><p>This will permanently clear the current local answer sheet.</p><div className="modalActions"><button className="secondary" onClick={() => setShowReset(false)}>Cancel</button><button className="dangerBtn" onClick={doReset}>Reset Test</button></div></div></div>}
    </div>
  </div>
}

function TestView({ state, updateAnswer, answeredCount, finish, remaining }: any) {
  return <main className="content">
    <div className="infoRow"><div><h2>Answer Sheet</h2><p>Mark the option you selected in the actual exam. You can change it anytime.</p></div><div className="progressBox"><b>{answeredCount}/120</b><span>answered</span></div></div>
    {remaining <= 600 && <div className="warning"><AlertTriangle size={18}/> Less than 10 minutes remaining. Your sheet will auto-lock at 00:00:00.</div>}
    <div className="omrCard"><div className="tableHeader"><span>Q.NO.</span><span>A</span><span>B</span><span>C</span><span>D</span><span>STATUS</span></div>
      <div className="rows">{state.answers.map((answer: Answer, i: number) => <div className={`omrRow ${answer ? 'selected' : ''}`} key={i}><span className="qno">{String(i+1).padStart(3,'0')}</span>{(['A','B','C','D'] as const).map(opt => <button key={opt} className={`bubble ${answer===opt ? 'on' : ''}`} onClick={() => updateAnswer(i, answer===opt ? null : opt)}>{opt}</button>)}<span className="statusText">{answer ? `Marked ${answer}` : 'Unanswered'}</span></div>)}</div>
    </div>
    <div className="bottomBar"><div><b>{answeredCount}</b> answered <span>·</span> <b>{120-answeredCount}</b> unanswered</div><button className="primary" onClick={finish}>Finish Test <Check size={17}/></button></div>
  </main>
}

function MarkingView({ state, updateEval, evaluatedCount, stats, finish }: any) {
  return <main className="content">
    <div className="infoRow"><div><h2>Marking Mode</h2><p>Check your official answer key, then mark each question as correct, wrong, or unattempted.</p></div><div className="progressBox"><b>{evaluatedCount}/120</b><span>evaluated</span></div></div>
    <div className="legend"><span><i className="dot correct"/> Correct</span><span><i className="dot wrong"/> Wrong</span><span><i className="dot unattempted"/> Unattempted</span></div>
    <div className="markGrid">{state.evaluations.map((ev: Evaluation, i: number) => <div className={`markCard ${ev || ''}`} key={i}><div className="markHead"><b>Q {i+1}</b><span>Your answer: <strong>{state.answers[i] ?? '—'}</strong></span></div><div className="markButtons"><button className={ev==='correct'?'active':''} onClick={() => updateEval(i,'correct')}><Check size={16}/> Correct</button><button className={ev==='wrong'?'active':''} onClick={() => updateEval(i,'wrong')}><X size={16}/> Wrong</button><button className={ev==='unattempted'?'active':''} onClick={() => updateEval(i,'unattempted')}><Minus size={16}/> Unattempted</button></div></div>)}</div>
    <div className="bottomBar"><div><b>{stats.correct}</b> correct <span>·</span> <b>{stats.wrong}</b> wrong <span>·</span> <b>{stats.unattempted}</b> unattempted</div><button className="primary" onClick={finish}>Calculate Result <Trophy size={17}/></button></div>
  </main>
}

function ResultView({ state, stats, exportResult, backToMarking }: any) {
  return <main className="content resultPage">
    <div className="resultHero"><div className="resultIcon"><Trophy size={30}/></div><div className="eyebrow">TEST COMPLETE</div><h1>{stats.score.toFixed(2)} <small>/ 100</small></h1><p>{state.examName || 'Mock Test'} · 120 questions · 2-hour limit</p></div>
    <div className="resultGrid"><div className="resultStat correct"><span>Correct</span><b>{stats.correct}</b><small>+{stats.positive.toFixed(2)} marks</small></div><div className="resultStat wrong"><span>Wrong</span><b>{stats.wrong}</b><small>−{stats.negative.toFixed(2)} marks</small></div><div className="resultStat"><span>Unattempted</span><b>{stats.unattempted}</b><small>0 marks</small></div></div>
    <div className="breakdown"><div><span>Positive marks</span><b>+{stats.positive.toFixed(2)}</b></div><div><span>Negative marks</span><b>−{stats.negative.toFixed(2)}</b></div><div><span>Final score</span><b>{stats.score.toFixed(2)} / 100</b></div></div>
    <div className="resultActions"><button className="secondary" onClick={backToMarking}>Review / edit marking</button><button className="primary" onClick={exportResult}><Download size={17}/> Export result</button></div>
    <div className="reviewGrid">{state.evaluations.map((ev: Evaluation, i: number) => <div className={`reviewCell ${ev || 'pending'}`} key={i}><b>{String(i+1).padStart(3,'0')}</b><span>{state.answers[i] ?? '—'}</span><i>{ev==='correct'?'✓':ev==='wrong'?'✕':ev==='unattempted'?'—':'?'}</i></div>)}</div>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />);
