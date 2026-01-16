
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `Você é uma Inteligência Artificial que atua como guia alimentar e de saúde diário.
Seu papel é ajudar pessoas comuns a comerem melhor e se manterem ativas.

MODOS DE OPERAÇÃO:
1. REGISTRO ALIMENTAR: Analise o que o usuário comeu, dê feedback e estime calorias.
2. SUGESTÃO ALIMENTAR: Sugira refeições com o que o usuário tem em casa.
3. EXERCÍCIO: Estime o gasto calórico de uma atividade física descrita pelo usuário.
4. SAÚDE: Você sabe calcular IMC e peso ideal.

REGRAS:
- SEMPRE retorne no final do texto a tag: [STATUS:COR][CALORIES:NUMERO][TYPE:MEAL|EXERCISE]`;

interface UserData {
  name: string;
  birthDate: string;
  age: string;
  gender: string;
  weight: string;
  height: string;
  goal: string;
  activityLevel: 'sedentario' | 'leve' | 'moderado' | 'intenso';
  calorieGoal: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface MealRecord {
  id: string;
  date: string;
  type: string;
  description: string;
  feedback: string;
  status: 'verde' | 'amarelo' | 'azul';
  calories: number;
}

interface ExerciseRecord {
  id: string;
  date: string;
  description: string;
  caloriesBurned: number;
}

interface WeightLog {
  date: string;
  weight: number;
}

const App: React.FC = () => {
  const [step, setStep] = useState<number>(0);
  const [userData, setUserData] = useState<UserData>({
    name: '', birthDate: '', age: '', gender: '', weight: '', height: '', goal: '', activityLevel: 'sedentario', calorieGoal: 2000
  });
  
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [waterGlasses, setWaterGlasses] = useState<number>(0);
  const [dailyTip, setDailyTip] = useState<string>('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

  const [onboardingBirthDate, setOnboardingBirthDate] = useState('');
  const [onboardingGender, setOnboardingGender] = useState('');
  const [onboardingWeight, setOnboardingWeight] = useState('');
  const [onboardingHeight, setOnboardingHeight] = useState('');

  const [inputVal, setInputVal] = useState('');
  const [mealTypeContext, setMealTypeContext] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mode, setMode] = useState<'meal' | 'suggest' | 'exercise'>('meal');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '""') {
      setHasApiKey(false);
    } else {
      setHasApiKey(true);
    }

    try {
      const saved = localStorage.getItem('nutri_user_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) {
          setUserData(parsed);
          const savedMeals = localStorage.getItem('nutri_meals_history');
          const savedExercises = localStorage.getItem('nutri_exercises_history');
          const savedWeight = localStorage.getItem('nutri_weight_history');
          if (savedMeals) setMeals(JSON.parse(savedMeals));
          if (savedExercises) setExercises(JSON.parse(savedExercises));
          if (savedWeight) setWeightHistory(JSON.parse(savedWeight));
          setStep(6);
          return;
        }
      }
      setStep(1);
    } catch (e) {
      setStep(1);
    }
  }, []);

  useEffect(() => {
    if (step === 5) {
      const timer = setTimeout(() => setStep(6), 2500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  useEffect(() => {
    if (step >= 6) {
      const savedWater = localStorage.getItem(`nutri_water_${selectedDate}`);
      const savedTip = localStorage.getItem(`nutri_tip_${selectedDate}`);
      setWaterGlasses(savedWater ? parseInt(savedWater) : 0);
      setDailyTip(savedTip || '');
      if (!savedTip && step === 6 && userData.name && hasApiKey) generateDailyTip(selectedDate);
    }
  }, [selectedDate, step, userData, hasApiKey]);

  useEffect(() => {
    if (step >= 6) {
      localStorage.setItem(`nutri_water_${selectedDate}`, waterGlasses.toString());
    }
  }, [waterGlasses, selectedDate, step]);

  const generateDailyTip = async (date: string) => {
    if (!hasApiKey) return;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Gere uma dica de saúde curta para ${userData.name}. Máximo 15 palavras.`,
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      const tip = response.text || "Beba água e mantenha o foco!";
      setDailyTip(tip);
      localStorage.setItem(`nutri_tip_${date}`, tip);
    } catch (e) {
      setDailyTip("A constância é a chave do seu sucesso!");
    }
  };

  const handleEntryRegistration = async () => {
    if (!inputVal) return;
    setIsAnalyzing(true);
    try {
      if (!hasApiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let prompt = "";
      
      if (mode === 'exercise') {
        prompt = `EXERCÍCIO: Fez "${inputVal}". Peso: ${userData.weight}kg. [STATUS:VERDE][CALORIES:NUM][TYPE:EXERCISE]`;
      } else if (mode === 'meal') {
        prompt = `REGISTRO: Comeu "${inputVal}" no ${mealTypeContext}. [STATUS:COR][CALORIES:NUM][TYPE:MEAL]`;
      } else {
        prompt = `SUGESTÃO: Ingredientes "${inputVal}". [STATUS:VERDE][CALORIES:NUM][TYPE:MEAL]`;
      }
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      
      const text = response.text || "";
      const cleanedFeedback = text.split('[STATUS:')[0];
      setFeedback(cleanedFeedback);
      
      let val = 0;
      const valMatch = text.match(/\[CALORIES:(\d+)\]/);
      if (valMatch) val = parseInt(valMatch[1]);

      if (mode === 'exercise') {
        const newEx: ExerciseRecord = { id: Date.now().toString(), date: selectedDate, description: inputVal, caloriesBurned: val || 200 };
        const updated = [...exercises, newEx];
        setExercises(updated);
        localStorage.setItem('nutri_exercises_history', JSON.stringify(updated));
      } else if (mode === 'meal') {
        let status: 'verde' | 'amarelo' | 'azul' = 'verde';
        if (text.includes('STATUS:AMARELO')) status = 'amarelo';
        else if (text.includes('STATUS:AZUL')) status = 'azul';

        const newMeal: MealRecord = { id: Date.now().toString(), date: selectedDate, type: mealTypeContext || "Lanche", description: inputVal, feedback: cleanedFeedback, status, calories: val || 300 };
        const updated = [...meals, newMeal];
        setMeals(updated);
        localStorage.setItem('nutri_meals_history', JSON.stringify(updated));
      }
    } catch (error) {
      setFeedback("Não consegui analisar agora, mas o registro foi salvo!");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const calculateDailyCalories = (dateStr: string) => {
    const consumed = meals.filter(m => m.date === dateStr).reduce((s, m) => s + (m.calories || 0), 0);
    const burned = exercises.filter(e => e.date === dateStr).reduce((s, e) => s + (e.caloriesBurned || 0), 0);
    return { consumed, burned, net: consumed - burned };
  };

  const getWeekDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatting) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatting(true);
    try {
      if (!hasApiKey) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [...chatMessages, userMsg].map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] })),
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      setChatMessages(prev => [...prev, { role: 'model', text: response.text || "..." }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Erro ao responder." }]);
    } finally {
      setIsChatting(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const getDayLabel = (dateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) return "Hoje";
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  };

  const calculateBMI = () => {
    const w = parseFloat(userData.weight);
    const h = parseFloat(userData.height) / 100;
    return (w && h) ? w / (h * h) : 0;
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-400' };
    if (bmi < 25) return { label: 'Peso normal', color: 'text-emerald-400' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'text-amber-400' };
    return { label: 'Obesidade', color: 'text-red-400' };
  };

  const ApiKeyAlert = () => !hasApiKey ? (
    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-4 text-[10px] text-red-400 font-bold uppercase tracking-widest">
      ⚠️ API_KEY não configurada na Vercel.
    </div>
  ) : null;

  if (step === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-[#020617] justify-center items-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (step >= 6) {
    const stats = calculateDailyCalories(selectedDate);
    const isViewingToday = selectedDate === new Date().toISOString().split('T')[0];
    const totalMeta = userData.calorieGoal + stats.burned;
    const progressPercent = Math.min(100, (stats.consumed / totalMeta) * 100);

    return (
      <div className="flex flex-col min-h-screen bg-[#020617] text-slate-100 pb-32 font-sans overflow-x-hidden">
        <div className="fixed top-[-10%] left-[-10%] w-[80%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[60%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none"></div>

        <header className="px-6 pt-12 pb-6 bg-[#0f172a]/40 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-[100] flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-emerald-400 font-mono tracking-tighter uppercase leading-none">Nutri<span className="text-white">Amiga</span></h1>
            <p className="text-slate-400 text-[10px] mt-1 font-bold uppercase tracking-[0.2em] opacity-60">Olá, {userData.name.split(' ')[0]}!</p>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 border border-white/10">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </header>

        {isSettingsOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black">Ajustes</h2>
                 <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 text-xl">✕</button>
               </div>
               <ApiKeyAlert />
               <button onClick={() => { if(confirm("Apagar tudo?")) { localStorage.clear(); window.location.reload(); } }} className="w-full border border-red-500/30 text-red-400 p-4 rounded-2xl font-black text-xs uppercase tracking-widest">Resetar Aplicativo</button>
            </div>
          </div>
        )}

        <main className="p-6 space-y-6 max-w-md mx-auto w-full flex-1">
          {step === 6 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <ApiKeyAlert />
              <section className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Consumido hoje</p>
                    <h3 className="text-4xl font-black tracking-tight">{stats.consumed} <span className="text-sm text-slate-500 uppercase">kcal</span></h3>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Atividade</p>
                    <h4 className="text-xl font-black text-emerald-400">+{stats.burned} <span className="text-[10px]">kcal</span></h4>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden p-1">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                     <span>Restam {(totalMeta - stats.consumed).toFixed(0)} kcal</span>
                     <span className="text-white bg-white/5 px-3 py-1 rounded-full">Meta: {totalMeta}</span>
                  </div>
                </div>
              </section>

              <section className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-5 flex items-start gap-4">
                <div className="text-2xl mt-1">✨</div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Dica Inteligente</h4>
                  <p className="text-xs text-slate-300 font-medium italic">"{dailyTip || "Focando no progresso..."}"</p>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Água</h4>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setWaterGlasses(Math.max(0, waterGlasses - 1))} className="w-8 h-8 rounded-full bg-white/5 font-black">-</button>
                    <span className="text-2xl font-black">{waterGlasses}</span>
                    <button onClick={() => setWaterGlasses(waterGlasses + 1)} className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-black">+</button>
                  </div>
                </section>
                <section onClick={() => setStep(11)} className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-2 cursor-pointer">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Peso</h4>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-2xl font-black">{userData.weight}</span>
                    <span className="text-xs font-black text-slate-500">kg</span>
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[2.5rem] flex flex-col items-center gap-2">
                    <span className="text-3xl">🥗</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">Comi algo</span>
                 </button>
                 <button onClick={() => { setMode('exercise'); setStep(9); }} className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-[2.5rem] flex flex-col items-center gap-2">
                    <span className="text-3xl">🏃‍♂️</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">Treinei</span>
                 </button>
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-6 animate-in fade-in pb-20">
               <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-black tracking-tighter">Diário</h2>
                 <p className="text-sm font-black text-emerald-400">{stats.net} kcal</p>
               </div>
               
               <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                 {getWeekDays().map(dateStr => (
                   <button 
                     key={dateStr} 
                     onClick={() => setSelectedDate(dateStr)} 
                     className={`flex flex-col items-center min-w-[65px] p-4 rounded-3xl border transition-all ${selectedDate === dateStr ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900/40 border-white/5'}`}
                   >
                     <span className={`text-[8px] font-black uppercase tracking-widest ${selectedDate === dateStr ? 'text-white' : 'text-slate-500'}`}>{getDayLabel(dateStr)}</span>
                     <span className={`text-lg font-black mt-1 ${selectedDate === dateStr ? 'text-white' : 'text-slate-200'}`}>{dateStr.split('-')[2]}</span>
                   </button>
                 ))}
               </div>

               <div className="space-y-4">
                 {["Café da Manhã", "Almoço", "Café da Tarde", "Jantar"].map(type => {
                   const rec = meals.find(m => m.date === selectedDate && m.type === type);
                   return (
                     <button key={type} onClick={() => { if(!rec) { setMode('meal'); setMealTypeContext(type); setStep(9); } }} className="w-full text-left bg-slate-900/60 border border-white/5 p-6 rounded-[2rem]">
                       <div className="flex justify-between items-center mb-3">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{type}</h4>
                         {rec && <span className="text-[10px] font-black text-emerald-400">{rec.calories} kcal</span>}
                       </div>
                       {rec ? (
                         <div className="space-y-2">
                           <p className="font-bold text-sm">"{rec.description}"</p>
                           <p className="text-[10px] text-slate-500 italic leading-relaxed line-clamp-2">{rec.feedback}</p>
                         </div>
                       ) : (
                         <p className="text-[9px] font-black text-emerald-400/50 uppercase tracking-widest">+ Adicionar</p>
                       )}
                     </button>
                   );
                 })}
               </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-8">
               <button onClick={() => setStep(isViewingToday ? 6 : 10)} className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">← Voltar</button>
               <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 space-y-6">
                 {mode !== 'exercise' && (
                   <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                      <button onClick={() => setMode('meal')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl ${mode === 'meal' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}>Já comi</button>
                      <button onClick={() => setMode('suggest')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl ${mode === 'suggest' ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}>Dica IA</button>
                   </div>
                 )}
                 <h2 className="text-2xl font-black tracking-tighter">O que foi?</h2>
                 <textarea value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="..." className="w-full h-40 bg-black/40 border-2 border-white/5 rounded-3xl p-6 outline-none text-white resize-none" />
                 <button onClick={handleEntryRegistration} disabled={isAnalyzing || !inputVal} className="w-full py-5 bg-emerald-500 rounded-3xl font-black text-xs uppercase tracking-widest disabled:opacity-50">
                    {isAnalyzing ? 'Processando...' : 'Salvar'}
                 </button>
               </div>
               {feedback && (
                 <div className="bg-white/5 border border-white/5 p-8 rounded-[2.5rem] space-y-4">
                   <p className="text-sm font-medium leading-relaxed italic text-slate-300">"{feedback}"</p>
                   <button onClick={() => { setStep(isViewingToday ? 6 : 10); setFeedback(null); setInputVal(''); }} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest">OK!</button>
                 </div>
               )}
            </div>
          )}

          {step === 8 && (
            <div className="flex flex-col h-[75vh] animate-in fade-in">
               <button onClick={() => setStep(6)} className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-4">← Sair</button>
               <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-6">
                 {chatMessages.map((msg, i) => (
                   <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm ${msg.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-900 border border-white/5 text-slate-100'}`}>
                       {msg.text}
                     </div>
                   </div>
                 ))}
                 <div ref={chatEndRef} />
               </div>
               <div className="bg-slate-900 border border-white/10 p-3 rounded-[2rem] flex gap-2">
                 <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Mensagem..." className="flex-1 bg-transparent px-4 outline-none text-sm" />
                 <button onClick={handleSendMessage} className="bg-emerald-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center">🚀</button>
               </div>
            </div>
          )}

          {step === 11 && (
            <div className="space-y-6 animate-in fade-in">
               <button onClick={() => setStep(6)} className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">← Home</button>
               <h2 className="text-2xl font-black tracking-tighter">Sua Saúde</h2>
               <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">IMC Atual</p>
                  <span className="text-5xl font-black text-white">{calculateBMI().toFixed(1)}</span>
                  <span className={`text-xs font-black uppercase mt-2 ${getBMICategory(calculateBMI()).color}`}>{getBMICategory(calculateBMI()).label}</span>
               </div>
            </div>
          )}
        </main>

        <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex items-center justify-around px-4 z-[150] shadow-2xl">
          <button onClick={() => { setStep(6); setSelectedDate(new Date().toISOString().split('T')[0]); }} className={`flex flex-col items-center gap-1 ${step === 6 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">🏠</span>
            <span className="text-[7px] font-black uppercase">Home</span>
          </button>
          <button onClick={() => setStep(10)} className={`flex flex-col items-center gap-1 ${step === 10 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">📅</span>
            <span className="text-[7px] font-black uppercase">Diário</span>
          </button>
          <div className="relative -top-10">
            <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="w-16 h-16 bg-emerald-500 text-white rounded-[1.8rem] flex items-center justify-center font-black text-3xl shadow-xl">+</button>
          </div>
          <button onClick={() => setStep(11)} className={`flex flex-col items-center gap-1 ${step === 11 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">📈</span>
            <span className="text-[7px] font-black uppercase tracking-widest">Saúde</span>
          </button>
          <button onClick={() => setStep(8)} className={`flex flex-col items-center gap-1 ${step === 8 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">💬</span>
            <span className="text-[7px] font-black uppercase tracking-widest">Chat</span>
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-white font-sans overflow-y-auto">
      {step === 1 && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80')] bg-cover bg-center transition-transform duration-[30s] scale-110 animate-pulse-slow">
             <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/70 to-transparent"></div>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-end p-10 pb-20 text-center space-y-6">
            <h1 className="text-6xl font-black tracking-tighter">Nutri<span className="text-emerald-400">Amiga</span></h1>
            <p className="text-slate-400 text-lg font-medium italic">Sua saúde, do seu jeito.</p>
            <button onClick={() => setStep(2)} className="bg-emerald-500 text-white py-6 rounded-[2.5rem] font-black text-xl uppercase tracking-widest">Bora começar!</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-10 tracking-tighter">Como posso te chamar?</h2>
          <input type="text" placeholder="Nome..." className="bg-white/5 border-2 border-white/5 p-6 rounded-[2rem] text-xl focus:border-emerald-500/50 outline-none" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} />
          <button onClick={() => {if(userData.name) setStep(3)}} className="bg-emerald-500 text-white py-6 rounded-[2.5rem] font-black text-lg mt-auto mb-16 uppercase">Continuar</button>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col pt-20 px-8 pb-10 animate-in slide-in-from-right">
          <h2 className="text-3xl font-black mb-8 tracking-tighter">Só o básico...</h2>
          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Nascimento</label>
              <input type="date" value={onboardingBirthDate} onChange={(e) => setOnboardingBirthDate(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none" style={{ colorScheme: 'dark' }} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Sexo</label>
              <div className="flex bg-white/5 p-1 rounded-2xl border-2 border-white/5">
                {['M', 'F', 'Outro'].map(g => (
                  <button key={g} onClick={() => setOnboardingGender(g)} className={`flex-1 py-4 text-[10px] font-black rounded-xl ${onboardingGender === g ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}>{g}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Peso (kg)</label>
                <input type="number" placeholder="70" value={onboardingWeight} onChange={(e) => setOnboardingWeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Altura (cm)</label>
                <input type="number" placeholder="170" value={onboardingHeight} onChange={(e) => setOnboardingHeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center" />
              </div>
            </div>
          </div>
          <button onClick={() => { if (onboardingBirthDate && onboardingWeight && onboardingHeight && onboardingGender) setStep(4); }} className="py-6 rounded-[2.5rem] font-black text-lg bg-emerald-500 text-white uppercase">Próximo</button>
        </div>
      )}

      {step === 4 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter">O que buscamos?</h2>
          <div className="space-y-4">
            {['Emagrecer', 'Manter Saúde', 'Ganhar Músculos'].map(opt => (
              <button key={opt} onClick={() => { setUserData({...userData, goal: opt}); setStep(4.5); }} className="w-full text-left p-8 rounded-[2rem] bg-white/5 border-2 border-white/5 flex items-center justify-between">
                <span className="text-lg font-black">{opt}</span>
                <span className="text-2xl">✨</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4.5 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter">Sua rotina?</h2>
          <div className="space-y-4">
            {[
              { id: 'sedentario', label: 'Sedentário', factor: 1.2 },
              { id: 'leve', label: 'Levemente Ativo', factor: 1.375 },
              { id: 'moderado', label: 'Moderado', factor: 1.55 },
              { id: 'intenso', label: 'Muito Ativo', factor: 1.725 }
            ].map(opt => (
              <button key={opt.id} onClick={() => {
                const base = userData.goal === 'Emagrecer' ? 22 : userData.goal === 'Ganhar Músculos' ? 35 : 28;
                const cGoal = Math.round(parseFloat(onboardingWeight) * base * opt.factor);
                const final = { ...userData, weight: onboardingWeight, height: onboardingHeight, gender: onboardingGender, birthDate: onboardingBirthDate, activityLevel: opt.id as any, calorieGoal: cGoal };
                setUserData(final);
                localStorage.setItem('nutri_user_data', JSON.stringify(final));
                setStep(5);
              }} className="w-full text-left p-6 rounded-[2rem] bg-white/5 border-2 border-white/5">
                <p className="text-lg font-black">{opt.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-12">
          <div className="w-48 h-48 border-[6px] border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-10"></div>
          <h2 className="text-3xl font-black tracking-tighter animate-pulse">Calculando tudo...</h2>
        </div>
      )}
    </div>
  );
};

export default App;
