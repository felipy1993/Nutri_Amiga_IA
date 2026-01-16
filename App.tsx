
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `Você é a NutriAmiga IA, a Nutricionista Particular do usuário. Sua missão é ser precisa, motivadora e educativa.

COMPORTAMENTO:
1. REGISTRO (JÁ COMI): Analise a descrição. Para CADA ingrediente/item, estime o peso/quantidade em gramas/ml e as calorias individuais.
2. GELADEIRA (O QUE COMER?): O usuário dirá o que tem disponível. Crie uma sugestão de refeição saudável. Liste os ingredientes usados com peso e calorias.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Inicie com um comentário motivador sobre a escolha.
Depois, use EXATAMENTE estas tags para os dados (NÃO mude a estrutura):
[ITEM: Nome do Alimento | Peso/Qtd | Calorias]
[TOTAL_CALORIES: NUMERO]
[STATUS: VERDE|AMARELO|AZUL]

Exemplo: "Excelente! O frango grelhado é uma proteína magra perfeita para seu objetivo. [ITEM: Peito de Frango | 120g | 190] [ITEM: Brócolis no Vapor | 80g | 28] [TOTAL_CALORIES: 218] [STATUS: VERDE]"`;

interface FoodItem {
  name: string;
  weight: string;
  calories: number;
}

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
  items: FoodItem[];
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
  const [currentAnalysisItems, setCurrentAnalysisItems] = useState<FoodItem[]>([]);
  const [currentAnalysisTotal, setCurrentAnalysisTotal] = useState<number>(0);
  const [currentAnalysisStatus, setCurrentAnalysisStatus] = useState<'verde' | 'amarelo' | 'azul'>('verde');
  const [mode, setMode] = useState<'meal' | 'suggest' | 'exercise'>('meal');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const callGemini = async (prompt: string, model: string = 'gemini-3-flash-preview', retries: number = 3): Promise<string> => {
    let lastError: any = null;
    for (let i = 0; i < retries; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: { systemInstruction: SYSTEM_INSTRUCTION }
        });
        return response.text || "";
      } catch (err: any) {
        lastError = err;
        if (err?.status === 429) {
          await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  };

  useEffect(() => {
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === 'undefined' || apiKey === '""' || apiKey === '') {
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
  }, [selectedDate, step, userData.name, hasApiKey]);

  useEffect(() => {
    if (step >= 6) {
      localStorage.setItem(`nutri_water_${selectedDate}`, waterGlasses.toString());
    }
  }, [waterGlasses, selectedDate, step]);

  const generateDailyTip = async (date: string) => {
    if (!hasApiKey) return;
    try {
      const prompt = `Gere uma dica de saúde curta para ${userData.name}. Máximo 15 palavras.`;
      const text = await callGemini(prompt);
      setDailyTip(text || "Beba água e mantenha o foco!");
      localStorage.setItem(`nutri_tip_${date}`, text);
    } catch (e) {
      setDailyTip("A constância é a chave do seu sucesso!");
    }
  };

  const parseAIResponse = (text: string) => {
    const items: FoodItem[] = [];
    const itemMatches = text.matchAll(/\[ITEM:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\d+)\s*\]/g);
    for (const match of itemMatches) {
      items.push({
        name: match[1],
        weight: match[2],
        calories: parseInt(match[3])
      });
    }

    let totalCal = 0;
    const totalMatch = text.match(/\[TOTAL_CALORIES:\s*(\d+)\]/);
    if (totalMatch) totalCal = parseInt(totalMatch[1]);
    else totalCal = items.reduce((acc, curr) => acc + curr.calories, 0);

    let status: 'verde' | 'amarelo' | 'azul' = 'verde';
    if (text.includes('STATUS: AMARELO')) status = 'amarelo';
    else if (text.includes('STATUS: AZUL')) status = 'azul';

    const feedback = text.split('[')[0].trim();

    return { items, totalCal, status, feedback };
  };

  const handleEntryRegistration = async () => {
    if (!inputVal) return;
    setIsAnalyzing(true);
    try {
      let prompt = "";
      if (mode === 'exercise') {
        prompt = `REGISTRO EXERCÍCIO: O usuário fez "${inputVal}". Informe calorias gastas aproximadas.`;
      } else if (mode === 'meal') {
        prompt = `REGISTRO ALIMENTAR: O usuário comeu "${inputVal}" no ${mealTypeContext || 'momento'}. Detalhe cada item com peso e calorias.`;
      } else {
        prompt = `GELADEIRA INTELIGENTE: O usuário tem na geladeira: "${inputVal}". Crie uma sugestão de refeição detalhando cada ingrediente usado, peso e calorias.`;
      }
      
      const text = await callGemini(prompt);
      const parsed = parseAIResponse(text);
      
      setFeedback(parsed.feedback);
      setCurrentAnalysisItems(parsed.items);
      setCurrentAnalysisTotal(parsed.totalCal);
      setCurrentAnalysisStatus(parsed.status);

      if (mode !== 'suggest') {
        if (mode === 'exercise') {
          const newEx: ExerciseRecord = { id: Date.now().toString(), date: selectedDate, description: inputVal, caloriesBurned: parsed.totalCal };
          const updated = [...exercises, newEx];
          setExercises(updated);
          localStorage.setItem('nutri_exercises_history', JSON.stringify(updated));
        } else {
          saveMeal(parsed);
        }
      }
    } catch (error) {
      setFeedback("Ops! Tive um problema técnico. Tente novamente em instantes.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const saveMeal = (data: { items: FoodItem[], totalCal: number, status: 'verde' | 'amarelo' | 'azul', feedback: string }) => {
    const newMeal: MealRecord = { 
      id: Date.now().toString(), 
      date: selectedDate, 
      type: mealTypeContext || "Lanche", 
      description: inputVal, 
      feedback: data.feedback, 
      status: data.status, 
      calories: data.totalCal,
      items: data.items
    };
    const updated = [...meals, newMeal];
    setMeals(updated);
    localStorage.setItem('nutri_meals_history', JSON.stringify(updated));
  };

  const handleConfirmSuggestion = () => {
    saveMeal({
      items: currentAnalysisItems,
      totalCal: currentAnalysisTotal,
      status: currentAnalysisStatus,
      feedback: feedback || ""
    });
    setStep(6);
    setFeedback(null);
    setInputVal('');
    setCurrentAnalysisItems([]);
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
    const currentMsgs = [...chatMessages, userMsg];
    setChatMessages(currentMsgs);
    setChatInput('');
    setIsChatting(true);
    try {
      const prompt = `Conversa atual: ${currentMsgs.map(m => `${m.role}: ${m.text}`).join('\n')}\nResponda como a Nutri IA.`;
      const text = await callGemini(prompt);
      setChatMessages(prev => [...prev, { role: 'model', text: text || "..." }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Muitas requisições agora. Pode tentar novamente em alguns segundos?" }]);
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

  const getWeightRange = () => {
    const h = parseFloat(userData.height) / 100;
    if (!h) return { min: 0, max: 0 };
    return {
      min: Math.round(18.5 * (h * h)),
      max: Math.round(24.9 * (h * h))
    };
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-400', bg: 'bg-blue-500/10' };
    if (bmi < 25) return { label: 'Peso normal', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'text-amber-400', bg: 'bg-amber-500/10' };
    return { label: 'Obesidade', color: 'text-red-400', bg: 'bg-red-500/10' };
  };

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
    const totalMeta = (userData.calorieGoal || 2000) + stats.burned;
    const progressPercent = Math.min(100, (stats.consumed / (totalMeta || 1)) * 100);

    return (
      <div className="flex flex-col min-h-screen bg-[#020617] text-slate-100 pb-32 font-sans overflow-x-hidden">
        <div className="fixed top-[-10%] left-[-10%] w-[80%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        
        <header className="px-6 pt-12 pb-6 bg-[#0f172a]/40 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-[100] flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-emerald-400 font-mono tracking-tighter uppercase leading-none">Nutri<span className="text-white">Amiga</span></h1>
            <p className="text-slate-400 text-[10px] mt-1 font-bold uppercase tracking-[0.2em] opacity-60">Olá, {userData.name.split(' ')[0]}!</p>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-transform">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </header>

        {isSettingsOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black text-white">Ajustes</h2>
                 <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 text-xl p-2">✕</button>
               </div>
               <button onClick={() => { if(confirm("Apagar tudo? Isso não pode ser desfeito.")) { localStorage.clear(); window.location.reload(); } }} className="w-full border border-red-500/30 text-red-400 p-4 rounded-2xl font-black text-xs uppercase tracking-widest active:bg-red-500/10">Resetar Aplicativo</button>
            </div>
          </div>
        )}

        <main className="p-6 space-y-6 max-w-md mx-auto w-full flex-1">
          {step === 6 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
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
                     <span>Restam {Math.max(0, totalMeta - stats.consumed).toFixed(0)} kcal</span>
                     <span className="text-white bg-white/5 px-3 py-1 rounded-full">Meta: {totalMeta}</span>
                  </div>
                </div>
              </section>

              <section className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-5 flex items-start gap-4">
                <div className="text-2xl mt-1">✨</div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Dica Inteligente</h4>
                  <p className="text-xs text-slate-300 font-medium italic">"{dailyTip || "Processando dica..."}"</p>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Água</h4>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setWaterGlasses(Math.max(0, waterGlasses - 1))} className="w-8 h-8 rounded-full bg-white/5 font-black active:bg-white/10">-</button>
                    <span className="text-2xl font-black">{waterGlasses}</span>
                    <button onClick={() => setWaterGlasses(waterGlasses + 1)} className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-black active:bg-blue-500/30">+</button>
                  </div>
                </section>
                <section onClick={() => setStep(11)} className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-2 cursor-pointer active:scale-95 transition-transform">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Peso</h4>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-2xl font-black">{userData.weight}</span>
                    <span className="text-xs font-black text-slate-500">kg</span>
                  </div>
                </section>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 active:bg-emerald-500/20 transition-colors">
                    <span className="text-3xl">🥗</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">O que você comeu?</span>
                 </button>
                 <button onClick={() => { setMode('suggest'); setStep(9); }} className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 active:bg-blue-500/20 transition-colors">
                    <span className="text-3xl">🧊</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">O que tem na geladeira?</span>
                 </button>
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-6 animate-in fade-in pb-20">
               <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-black tracking-tighter">Diário</h2>
                 <p className="text-sm font-black text-emerald-400">{stats.net} kcal líquidos</p>
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
                     <button key={type} onClick={() => { if(!rec) { setMode('meal'); setMealTypeContext(type); setStep(9); } }} className="w-full text-left bg-slate-900/60 border border-white/5 p-6 rounded-[2.5rem] active:border-emerald-500/30 transition-all">
                       <div className="flex justify-between items-center mb-3">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{type}</h4>
                         {rec && <span className="text-[10px] font-black text-emerald-400">{rec.calories} kcal</span>}
                       </div>
                       {rec ? (
                         <div className="space-y-4">
                           <p className="font-bold text-sm">"{rec.description}"</p>
                           <div className="flex flex-wrap gap-2">
                              {rec.items?.map((item, idx) => (
                                <div key={idx} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2">
                                   <span className="text-[9px] font-bold text-slate-300">{item.name}</span>
                                   <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 rounded-md">{item.weight}</span>
                                   <span className="text-[8px] text-slate-500">{item.calories} cal</span>
                                </div>
                              ))}
                           </div>
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
               <button onClick={() => { setStep(isViewingToday ? 6 : 10); setFeedback(null); setInputVal(''); setCurrentAnalysisItems([]); }} className="text-emerald-400 font-black text-[10px] uppercase tracking-widest p-2 -ml-2">← Voltar</button>
               
               <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
                 <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                   <button 
                    onClick={() => { setMode('meal'); setFeedback(null); }} 
                    className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${mode === 'meal' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                   >
                     Já comi
                   </button>
                   <button 
                    onClick={() => { setMode('suggest'); setFeedback(null); }} 
                    className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${mode === 'suggest' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-500'}`}
                   >
                     Geladeira IA
                   </button>
                 </div>

                 <h2 className="text-2xl font-black tracking-tighter text-white">
                   {mode === 'suggest' ? "O que tem em casa?" : "Relatório de Refeição"}
                 </h2>
                 
                 <p className="text-xs text-slate-500 -mt-4 leading-relaxed">
                   {mode === 'suggest' ? "Liste alguns ingredientes e sua Nutri IA monta sua receita com calorias detalhadas." : "Pode ser simples: 'Arroz, feijão e um ovo'."}
                 </p>

                 <textarea 
                   value={inputVal} 
                   onChange={(e) => setInputVal(e.target.value)} 
                   placeholder={mode === 'suggest' ? "Ex: Frango, tomate, abobrinha..." : "O que você saboreou?"} 
                   className="w-full h-32 bg-black/40 border-2 border-white/5 rounded-3xl p-6 outline-none text-white resize-none focus:border-emerald-500/30 transition-colors" 
                 />
                 
                 <button 
                  onClick={handleEntryRegistration} 
                  disabled={isAnalyzing || !inputVal.trim()} 
                  className={`w-full py-5 rounded-3xl font-black text-xs uppercase tracking-widest disabled:opacity-50 active:scale-[0.98] transition-all ${mode === 'suggest' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white'}`}
                 >
                    {isAnalyzing ? 'Processando...' : mode === 'suggest' ? 'Gerar Sugestão' : 'Registrar'}
                 </button>
               </div>
               
               {feedback && (
                 <div className="bg-slate-900/60 border border-white/5 p-8 rounded-[2.5rem] space-y-6 animate-in fade-in shadow-2xl backdrop-blur-md">
                   <div className="space-y-4">
                     <div className="flex items-center gap-3">
                        <span className="text-2xl">👩‍⚕️</span>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Nutri IA diz:</h4>
                     </div>
                     <p className="text-sm font-medium leading-relaxed italic text-slate-200">"{feedback}"</p>
                     
                     <div className="space-y-2 pt-4 border-t border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Detalhamento Nutricional:</p>
                        <div className="space-y-2">
                          {currentAnalysisItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                              <div>
                                <p className="text-[11px] font-bold text-white">{item.name}</p>
                                <p className="text-[9px] text-slate-500">{item.weight}</p>
                              </div>
                              <p className="text-[10px] font-black text-emerald-400">{item.calories} kcal</p>
                            </div>
                          ))}
                          <div className="flex justify-between items-center p-3 mt-2 bg-emerald-500/10 rounded-2xl">
                             <span className="text-[10px] font-black uppercase tracking-widest">Total Estimado</span>
                             <span className="text-sm font-black text-emerald-400">{currentAnalysisTotal} kcal</span>
                          </div>
                        </div>
                     </div>
                   </div>
                   
                   {mode === 'suggest' ? (
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setFeedback(null); setInputVal(''); }} className="py-4 border border-white/10 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest">Outra idéia</button>
                        <button onClick={handleConfirmSuggestion} className="py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20">Vou comer!</button>
                     </div>
                   ) : (
                     <button onClick={() => { setStep(isViewingToday ? 6 : 10); setFeedback(null); setInputVal(''); setCurrentAnalysisItems([]); }} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">Confirmar</button>
                   )}
                 </div>
               )}
            </div>
          )}

          {step === 8 && (
            <div className="flex flex-col h-[75vh] animate-in fade-in">
               <button onClick={() => setStep(6)} className="text-emerald-400 font-black text-[10px] uppercase tracking-widest mb-4 p-2 -ml-2">← Sair</button>
               <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-6">
                 {chatMessages.length === 0 && (
                   <div className="text-center py-10 px-6 opacity-40">
                      <p className="text-sm font-medium">Oi! Tem alguma dúvida sobre sua alimentação hoje?</p>
                   </div>
                 )}
                 {chatMessages.map((msg, i) => (
                   <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-slate-900 border border-white/5 text-slate-100 rounded-bl-none'}`}>
                       {msg.text}
                     </div>
                   </div>
                 ))}
                 <div ref={chatEndRef} />
               </div>
               <div className="bg-slate-900 border border-white/10 p-3 rounded-[2rem] flex gap-2">
                 <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Tire uma dúvida..." className="flex-1 bg-transparent px-4 outline-none text-sm text-white" />
                 <button onClick={handleSendMessage} className="bg-emerald-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95 transition-transform">🚀</button>
               </div>
            </div>
          )}

          {step === 11 && (
            <div className="space-y-6 animate-in fade-in pb-10">
               <button onClick={() => setStep(6)} className="text-emerald-400 font-black text-[10px] uppercase tracking-widest p-2 -ml-2">← Home</button>
               <h2 className="text-3xl font-black tracking-tighter text-white">Sua Saúde</h2>
               
               <div className="grid grid-cols-1 gap-4">
                  <div className={`border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center ${getBMICategory(calculateBMI()).bg}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Seu IMC</p>
                    <span className="text-6xl font-black text-white">{calculateBMI().toFixed(1)}</span>
                    <span className={`text-sm font-black uppercase mt-3 ${getBMICategory(calculateBMI()).color}`}>{getBMICategory(calculateBMI()).label}</span>
                  </div>

                  <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-xl">
                    <div className="flex justify-between items-center">
                       <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Seu Peso Ideal</h3>
                       <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full uppercase tracking-tighter">Meta Recomendada</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Mínimo</p>
                          <p className="text-2xl font-black text-white">{getWeightRange().min}<span className="text-[10px] text-slate-500 ml-0.5">kg</span></p>
                       </div>
                       <div className="h-10 w-[2px] bg-white/5"></div>
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Máximo</p>
                          <p className="text-2xl font-black text-white">{getWeightRange().max}<span className="text-[10px] text-slate-500 ml-0.5">kg</span></p>
                       </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-4">
                       <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Análise de Progresso</p>
                       {parseFloat(userData.weight) > getWeightRange().max ? (
                         <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-3xl flex items-center gap-4">
                            <span className="text-3xl">📉</span>
                            <p className="text-sm font-medium text-amber-100">Para chegar ao peso ideal, você pode focar em perder cerca de <span className="text-amber-400 font-black">{(parseFloat(userData.weight) - getWeightRange().max).toFixed(1)}kg</span>.</p>
                         </div>
                       ) : parseFloat(userData.weight) < getWeightRange().min ? (
                         <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-3xl flex items-center gap-4">
                            <span className="text-3xl">📈</span>
                            <p className="text-sm font-medium text-blue-100">Seu peso está abaixo do ideal. Seria bom ganhar uns <span className="text-blue-400 font-black">{(getWeightRange().min - parseFloat(userData.weight)).toFixed(1)}kg</span> de massa.</p>
                         </div>
                       ) : (
                         <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-3xl flex items-center gap-4">
                            <span className="text-3xl">🌟</span>
                            <p className="text-sm font-medium text-emerald-100">Parabéns! Você já está dentro da <span className="text-emerald-400 font-black">faixa de peso ideal</span> para sua altura.</p>
                         </div>
                       )}
                    </div>
                  </div>
               </div>

               <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8 space-y-4">
                 <div className="flex items-center gap-3">
                   <span className="text-2xl">💡</span>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nutri IA Recomenda</p>
                 </div>
                 <p className="text-xs leading-relaxed text-slate-300 font-medium italic">
                   "Lembre-se que o peso é apenas um número. O mais importante é como você se sente, sua energia diária e a qualidade dos alimentos que consome. Use os registros para manter o equilíbrio!"
                 </p>
               </div>
            </div>
          )}
        </main>

        <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex items-center justify-around px-4 z-[150] shadow-2xl">
          <button onClick={() => { setStep(6); setSelectedDate(new Date().toISOString().split('T')[0]); }} className={`flex flex-col items-center gap-1 transition-colors ${step === 6 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">🏠</span>
            <span className="text-[7px] font-black uppercase">Home</span>
          </button>
          <button onClick={() => setStep(10)} className={`flex flex-col items-center gap-1 transition-colors ${step === 10 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">📅</span>
            <span className="text-[7px] font-black uppercase">Diário</span>
          </button>
          <div className="relative -top-10">
            <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="w-16 h-16 bg-emerald-500 text-white rounded-[1.8rem] flex items-center justify-center font-black text-3xl shadow-xl active:scale-90 transition-transform">+</button>
          </div>
          <button onClick={() => setStep(11)} className={`flex flex-col items-center gap-1 transition-colors ${step === 11 ? 'text-emerald-400' : 'text-slate-600'}`}>
            <span className="text-xl">📈</span>
            <span className="text-[7px] font-black uppercase tracking-widest">Saúde</span>
          </button>
          <button onClick={() => setStep(8)} className={`flex flex-col items-center gap-1 transition-colors ${step === 8 ? 'text-emerald-400' : 'text-slate-600'}`}>
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
            <p className="text-slate-400 text-lg font-medium italic">Sua saúde, detalhe por detalhe.</p>
            <button onClick={() => setStep(2)} className="bg-emerald-500 text-white py-6 rounded-[2.5rem] font-black text-xl uppercase tracking-widest active:scale-95 transition-transform">Vamos nessa!</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-10 tracking-tighter text-white">Como posso te chamar?</h2>
          <input type="text" placeholder="Seu nome..." className="bg-white/5 border-2 border-white/5 p-6 rounded-[2rem] text-xl focus:border-emerald-500/50 outline-none text-white transition-colors" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} />
          <button onClick={() => {if(userData.name.trim()) setStep(3)}} disabled={!userData.name.trim()} className="bg-emerald-500 text-white py-6 rounded-[2.5rem] font-black text-lg mt-auto mb-16 uppercase disabled:opacity-50">Continuar</button>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col pt-20 px-8 pb-10 animate-in slide-in-from-right">
          <h2 className="text-3xl font-black mb-8 tracking-tighter text-white">Só o básico...</h2>
          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Nascimento</label>
              <input type="date" value={onboardingBirthDate} onChange={(e) => setOnboardingBirthDate(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-white" style={{ colorScheme: 'dark' }} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Sexo Biológico</label>
              <div className="flex bg-white/5 p-1 rounded-2xl border-2 border-white/5">
                {['M', 'F', 'Outro'].map(g => (
                  <button key={g} onClick={() => setOnboardingGender(g)} className={`flex-1 py-4 text-[10px] font-black rounded-xl transition-all ${onboardingGender === g ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}>{g}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Peso (kg)</label>
                <input type="number" placeholder="70" value={onboardingWeight} onChange={(e) => setOnboardingWeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center text-white" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Altura (cm)</label>
                <input type="number" placeholder="170" value={onboardingHeight} onChange={(e) => setOnboardingHeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center text-white" />
              </div>
            </div>
          </div>
          <button onClick={() => { if (onboardingBirthDate && onboardingWeight && onboardingHeight && onboardingGender) setStep(4); }} className="py-6 rounded-[2.5rem] font-black text-lg bg-emerald-500 text-white uppercase active:scale-95 transition-transform disabled:opacity-50">Próximo</button>
        </div>
      )}

      {step === 4 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter text-white">O que buscamos?</h2>
          <div className="space-y-4">
            {['Emagrecer', 'Manter Saúde', 'Ganhar Músculos'].map(opt => (
              <button key={opt} onClick={() => { setUserData({...userData, goal: opt}); setStep(4.5); }} className="w-full text-left p-8 rounded-[2rem] bg-white/5 border-2 border-white/5 flex items-center justify-between active:border-emerald-500/50 transition-all active:scale-[0.98]">
                <span className="text-lg font-black text-white">{opt}</span>
                <span className="text-2xl">✨</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4.5 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter text-white">Qual sua rotina?</h2>
          <div className="space-y-4">
            {[
              { id: 'sedentario', label: 'Sedentário', factor: 1.2 },
              { id: 'leve', label: 'Levemente Ativo', factor: 1.375 },
              { id: 'moderado', label: 'Moderado', factor: 1.55 },
              { id: 'intenso', label: 'Muito Ativo', factor: 1.725 }
            ].map(opt => (
              <button key={opt.id} onClick={() => {
                const base = userData.goal === 'Emagrecer' ? 22 : userData.goal === 'Ganhar Músculos' ? 35 : 28;
                const weightNum = parseFloat(onboardingWeight) || 70;
                const cGoal = Math.round(weightNum * base * opt.factor);
                const final = { ...userData, weight: onboardingWeight || '70', height: onboardingHeight || '170', gender: onboardingGender || 'M', birthDate: onboardingBirthDate, activityLevel: opt.id as any, calorieGoal: cGoal };
                setUserData(final);
                localStorage.setItem('nutri_user_data', JSON.stringify(final));
                setStep(5);
              }} className="w-full text-left p-6 rounded-[2rem] bg-white/5 border-2 border-white/5 active:border-emerald-500/50 transition-all active:scale-[0.98]">
                <p className="text-lg font-black text-white">{opt.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-12">
          <div className="w-48 h-48 border-[6px] border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin mb-10"></div>
          <h2 className="text-3xl font-black tracking-tighter animate-pulse text-white">Montando seu plano...</h2>
          <p className="mt-4 text-slate-400 text-sm">Quase lá! Analisando seus dados biológicos.</p>
        </div>
      )}
    </div>
  );
};

export default App;
