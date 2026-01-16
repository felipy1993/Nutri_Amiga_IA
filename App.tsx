
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `Você é a NutriAmiga IA, a Nutricionista Particular do usuário. Sua missão é ser precisa, motivadora e educativa, com um tom acolhedor e empático.

COMPORTAMENTO:
1. REGISTRO (JÁ COMI): Analise a descrição. Para CADA ingrediente/item, estime o peso/quantidade em gramas/ml e as calorias individuais.
2. GELADEIRA (O QUE COMER?): O usuário dirá o que tem disponível. Crie uma sugestão de refeição saudável. Liste os ingredientes usados com peso e calorias.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Inicie com um comentário motivador e gentil sobre a escolha.
Depois, use EXATAMENTE estas tags para os dados (NÃO mude a estrutura):
[ITEM: Nome do Alimento | Peso/Qtd | Calorias]
[TOTAL_CALORIES: NUMERO]
[STATUS: VERDE|AMARELO|AZUL]

Exemplo: "Que escolha maravilhosa! O frango grelhado com legumes vai te dar muita energia hoje. ✨ [ITEM: Peito de Frango | 120g | 190] [ITEM: Brócolis no Vapor | 80g | 28] [TOTAL_CALORIES: 218] [STATUS: VERDE]"`;

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
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

  // PWA Installation State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

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
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

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

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleUpdateWeight = () => {
    const val = parseFloat(newWeightInput);
    if (!newWeightInput || isNaN(val)) return;
    
    const today = new Date().toISOString().split('T')[0];
    const newWeightLog: WeightLog = { date: today, weight: val };
    
    // Atualiza userData
    const updatedUserData = { ...userData, weight: newWeightInput };
    setUserData(updatedUserData);
    localStorage.setItem('nutri_user_data', JSON.stringify(updatedUserData));
    
    // Atualiza Histórico
    // Filtramos se já houver registro hoje para substituir pelo mais recente
    const filteredHistory = weightHistory.filter(h => h.date !== today);
    const updatedHistory = [newWeightLog, ...filteredHistory].sort((a,b) => b.date.localeCompare(a.date));
    
    setWeightHistory(updatedHistory);
    localStorage.setItem('nutri_weight_history', JSON.stringify(updatedHistory));
    
    setIsWeightModalOpen(false);
    setNewWeightInput('');
  };

  const generateDailyTip = async (date: string) => {
    if (!hasApiKey) return;
    try {
      const prompt = `Gere uma dica de saúde e bem-estar feminina, curta e motivadora para ${userData.name}. Máximo 15 palavras. Use emojis como ✨ ou 🌸.`;
      const text = await callGemini(prompt);
      setDailyTip(text || "Você é sua prioridade hoje! ✨");
      localStorage.setItem(`nutri_tip_${date}`, text);
    } catch (e) {
      setDailyTip("Pequenos passos geram grandes transformações!");
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
        prompt = `GELADEIRA INTELIGENTE: O usuário tem na geladeira: "${inputVal}". Crie uma sugestão de refeição saudável e equilibrada detalhando cada ingrediente usado, peso e calorias.`;
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
      const prompt = `Conversa atual: ${currentMsgs.map(m => `${m.role}: ${m.text}`).join('\n')}\nResponda com carinho e precisão.`;
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
    if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-300', bg: 'bg-blue-500/10' };
    if (bmi < 25) return { label: 'Peso ideal ✨', color: 'text-rose-400', bg: 'bg-rose-500/10' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'text-amber-300', bg: 'bg-amber-500/10' };
    return { label: 'Obesidade', color: 'text-red-400', bg: 'bg-red-500/10' };
  };

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getWeightLossStats = () => {
    if (weightHistory.length < 1) return { initial: 0, current: 0, diff: 0 };
    const initial = weightHistory[weightHistory.length - 1].weight;
    const current = weightHistory[0].weight;
    return { initial, current, diff: current - initial };
  };

  if (step === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-[#020617] justify-center items-center">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
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
        <div className="fixed top-[-10%] left-[-10%] w-[80%] h-[40%] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[60%] h-[30%] bg-violet-500/5 blur-[100px] rounded-full pointer-events-none"></div>
        
        <header className="px-6 pt-12 pb-6 bg-[#0f172a]/20 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-[100] flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-rose-400 font-mono tracking-tighter uppercase leading-none">Nutri<span className="text-white">Amiga</span></h1>
            <p className="text-slate-400 text-[10px] mt-1 font-bold uppercase tracking-[0.2em] opacity-60">Olá, {userData.name.split(' ')[0]} ✨</p>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-transform">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </header>

        {isSettingsOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl animate-in zoom-in-95">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black text-white">Ajustes</h2>
                 <button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 text-xl p-2">✕</button>
               </div>
               
               <div className="space-y-4">
                 <button 
                  onClick={handleInstallClick}
                  className="w-full bg-gradient-to-r from-rose-500 to-pink-500 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
                 >
                   <span className="text-xl">📲</span> Instalar App
                 </button>

                 <button onClick={() => { if(confirm("Apagar tudo? Isso não pode ser desfeito.")) { localStorage.clear(); window.location.reload(); } }} className="w-full border border-red-500/30 text-red-400 p-4 rounded-2xl font-black text-xs uppercase tracking-widest active:bg-red-500/10">Resetar Aplicativo</button>
               </div>
            </div>
          </div>
        )}

        {isWeightModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setIsWeightModalOpen(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl animate-in zoom-in-95">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-black text-white">Atualizar Peso</h2>
                 <button onClick={() => setIsWeightModalOpen(false)} className="text-slate-500 text-xl p-2">✕</button>
               </div>
               
               <div className="space-y-6">
                 <p className="text-xs text-slate-400 leading-relaxed">Sua jornada é única! Viu alguma mudança na balança? Registre aqui para mantermos seus cálculos atualizados. ✨</p>
                 <div className="relative">
                   <input 
                    type="number" 
                    placeholder={userData.weight}
                    value={newWeightInput} 
                    onChange={(e) => setNewWeightInput(e.target.value)}
                    className="w-full bg-white/5 border-2 border-white/10 p-6 rounded-[1.5rem] text-2xl font-black text-center outline-none focus:border-rose-500/50 transition-colors"
                   />
                   <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-500 uppercase text-xs">kg</span>
                 </div>
                 <button 
                  onClick={handleUpdateWeight}
                  className="w-full bg-gradient-to-r from-rose-500 to-pink-500 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-rose-500/20"
                 >
                   Salvar Novo Peso 🌸
                 </button>
               </div>
            </div>
          </div>
        )}

        {showInstallGuide && (
          <div className="fixed inset-0 z-[300] flex items-end p-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowInstallGuide(false)}></div>
            <div className="bg-slate-900 w-full rounded-[2.5rem] p-8 relative animate-in slide-in-from-bottom-full border border-white/10">
               <h3 className="text-xl font-black mb-4">Adicionar à Tela de Início:</h3>
               <ol className="space-y-4 text-sm text-slate-300 mb-8">
                 <li className="flex gap-4 items-center">
                    <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black">1</span>
                    <span>Toque no botão de <strong>Compartilhar</strong> (ícone do Safari)</span>
                 </li>
                 <li className="flex gap-4 items-center">
                    <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black">2</span>
                    <span>Escolha <strong>"Adicionar à Tela de Início"</strong></span>
                 </li>
               </ol>
               <button onClick={() => setShowInstallGuide(false)} className="w-full py-4 bg-rose-500 rounded-2xl font-black text-xs uppercase tracking-widest">Entendi ✨</button>
            </div>
          </div>
        )}

        <main className="p-6 space-y-6 max-w-md mx-auto w-full flex-1">
          {step === 6 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              {!window.matchMedia('(display-mode: standalone)').matches && (
                <section onClick={handleInstallClick} className="bg-gradient-to-r from-rose-600/10 to-pink-400/5 border border-rose-500/20 p-5 rounded-3xl flex items-center justify-between cursor-pointer active:scale-95 transition-transform group">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-pink-400 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-rose-500/10">📱</div>
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400">Instalar App</h4>
                        <p className="text-xs text-white/80 font-medium">Fique mais conectada com sua saúde</p>
                      </div>
                   </div>
                   <span className="text-rose-400 group-hover:translate-x-1 transition-transform">→</span>
                </section>
              )}

              <section className="bg-gradient-to-br from-slate-900/60 to-slate-950/60 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-6 backdrop-blur-md">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Energia Consumida</p>
                    <h3 className="text-4xl font-black tracking-tight">{stats.consumed} <span className="text-sm text-slate-500 uppercase">kcal</span></h3>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">Gasto Extra</p>
                    <h4 className="text-xl font-black text-rose-400">+{stats.burned} <span className="text-[10px]">kcal</span></h4>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden p-1">
                    <div className="h-full bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                     <span>Restam {Math.max(0, totalMeta - stats.consumed).toFixed(0)} kcal</span>
                     <span className="text-white bg-white/5 px-3 py-1 rounded-full border border-white/5">Meta: {totalMeta}</span>
                  </div>
                </div>
              </section>

              <section className="bg-rose-500/5 border border-rose-500/10 rounded-3xl p-5 flex items-start gap-4">
                <div className="text-2xl mt-1">✨</div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-1">Dica de Bem-estar</h4>
                  <p className="text-xs text-slate-300 font-medium italic">"{dailyTip || "Processando dica..."}"</p>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-4">
                <section className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-violet-400">Hidratação</h4>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setWaterGlasses(Math.max(0, waterGlasses - 1))} className="w-8 h-8 rounded-full bg-white/5 font-black active:bg-white/10">-</button>
                    <span className="text-2xl font-black">💧 {waterGlasses}</span>
                    <button onClick={() => setWaterGlasses(waterGlasses + 1)} className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 font-black active:bg-violet-500/30">+</button>
                  </div>
                </section>
                <section onClick={() => setIsWeightModalOpen(true)} className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-2 cursor-pointer active:scale-95 transition-transform group">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400">Peso Atual</h4>
                    <span className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                  </div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-2xl font-black">{userData.weight}</span>
                    <span className="text-xs font-black text-slate-500">kg</span>
                  </div>
                  <p className="text-[8px] font-black uppercase text-rose-400/40 tracking-widest">Toque p/ atualizar</p>
                </section>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 active:bg-rose-500/10 transition-colors">
                    <span className="text-3xl">🥑</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">Já comi</span>
                 </button>
                 <button onClick={() => { setMode('suggest'); setStep(9); }} className="bg-violet-500/5 border border-violet-500/10 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 active:bg-violet-500/10 transition-colors">
                    <span className="text-3xl">🧊</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">O que comer?</span>
                 </button>
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-6 animate-in fade-in pb-20">
               <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-black tracking-tighter">Diário</h2>
                 <p className="text-sm font-black text-rose-400">{stats.net} kcal líquidos</p>
               </div>
               
               <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                 {getWeekDays().map(dateStr => (
                   <button 
                     key={dateStr} 
                     onClick={() => setSelectedDate(dateStr)} 
                     className={`flex flex-col items-center min-w-[65px] p-4 rounded-3xl border transition-all ${selectedDate === dateStr ? 'bg-rose-500 border-rose-500 shadow-lg shadow-rose-500/20' : 'bg-slate-900/40 border-white/5'}`}
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
                     <button key={type} onClick={() => { if(!rec) { setMode('meal'); setMealTypeContext(type); setStep(9); } }} className="w-full text-left bg-slate-900/60 border border-white/5 p-6 rounded-[2.5rem] active:border-rose-500/30 transition-all">
                       <div className="flex justify-between items-center mb-3">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{type}</h4>
                         {rec && <span className="text-[10px] font-black text-rose-400">{rec.calories} kcal</span>}
                       </div>
                       {rec ? (
                         <div className="space-y-4">
                           <p className="font-bold text-sm">"{rec.description}"</p>
                           <div className="flex flex-wrap gap-2">
                              {rec.items?.map((item, idx) => (
                                <div key={idx} className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2">
                                   <span className="text-[9px] font-bold text-slate-300">{item.name}</span>
                                   <span className="text-[8px] bg-rose-500/20 text-rose-400 px-1.5 rounded-md">{item.weight}</span>
                                   <span className="text-[8px] text-slate-500">{item.calories} cal</span>
                                </div>
                              ))}
                           </div>
                           <p className="text-[10px] text-slate-500 italic leading-relaxed line-clamp-2">{rec.feedback}</p>
                         </div>
                       ) : (
                         <p className="text-[9px] font-black text-rose-400/50 uppercase tracking-widest">+ Adicionar</p>
                       )}
                     </button>
                   );
                 })}
               </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-8">
               <button onClick={() => { setStep(isViewingToday ? 6 : 10); setFeedback(null); setInputVal(''); setCurrentAnalysisItems([]); }} className="text-rose-400 font-black text-[10px] uppercase tracking-widest p-2 -ml-2">← Voltar</button>
               
               <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
                 <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                   <button 
                    onClick={() => { setMode('meal'); setFeedback(null); }} 
                    className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${mode === 'meal' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-500'}`}
                   >
                     Já comi
                   </button>
                   <button 
                    onClick={() => { setMode('suggest'); setFeedback(null); }} 
                    className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${mode === 'suggest' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'text-slate-500'}`}
                   >
                     Geladeira IA
                   </button>
                 </div>

                 <h2 className="text-2xl font-black tracking-tighter text-white">
                   {mode === 'suggest' ? "O que tem em casa?" : "O que você comeu?"}
                 </h2>
                 
                 <p className="text-xs text-slate-500 -mt-4 leading-relaxed">
                   {mode === 'suggest' ? "Sua Nutri IA vai criar uma receita perfeita pra você." : "Conte-me cada detalhe da sua refeição."}
                 </p>

                 <textarea 
                   value={inputVal} 
                   onChange={(e) => setInputVal(e.target.value)} 
                   placeholder={mode === 'suggest' ? "Ex: Frango, espinafre, batata doce..." : "Descreva seu prato aqui..."} 
                   className="w-full h-32 bg-black/40 border-2 border-white/5 rounded-3xl p-6 outline-none text-white resize-none focus:border-rose-500/30 transition-colors" 
                 />
                 
                 <button 
                  onClick={handleEntryRegistration} 
                  disabled={isAnalyzing || !inputVal.trim()} 
                  className={`w-full py-5 rounded-3xl font-black text-xs uppercase tracking-widest disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg ${mode === 'suggest' ? 'bg-violet-500 text-white shadow-violet-500/20' : 'bg-rose-500 text-white shadow-rose-500/20'}`}
                 >
                    {isAnalyzing ? 'Analisando...' : mode === 'suggest' ? 'Gerar Sugestão ✨' : 'Registrar Agora'}
                 </button>
               </div>
               
               {feedback && (
                 <div className="bg-slate-900/60 border border-white/5 p-8 rounded-[2.5rem] space-y-6 animate-in fade-in shadow-2xl backdrop-blur-md">
                   <div className="space-y-4">
                     <div className="flex items-center gap-3">
                        <span className="text-2xl">👩‍⚕️</span>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400">Nutri IA diz:</h4>
                     </div>
                     <p className="text-sm font-medium leading-relaxed italic text-slate-200">"{feedback}"</p>
                     
                     <div className="space-y-2 pt-4 border-t border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Detalhes Nutricionais:</p>
                        <div className="space-y-2">
                          {currentAnalysisItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                              <div>
                                <p className="text-[11px] font-bold text-white">{item.name}</p>
                                <p className="text-[9px] text-slate-500">{item.weight}</p>
                              </div>
                              <p className="text-[10px] font-black text-rose-400">{item.calories} kcal</p>
                            </div>
                          ))}
                          <div className="flex justify-between items-center p-3 mt-2 bg-rose-500/10 rounded-2xl border border-rose-500/10">
                             <span className="text-[10px] font-black uppercase tracking-widest">Total</span>
                             <span className="text-sm font-black text-rose-400">{currentAnalysisTotal} kcal</span>
                          </div>
                        </div>
                     </div>
                   </div>
                   
                   {mode === 'suggest' ? (
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setFeedback(null); setInputVal(''); }} className="py-4 border border-white/10 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest">Outra idéia</button>
                        <button onClick={handleConfirmSuggestion} className="py-4 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20">Vou comer!</button>
                     </div>
                   ) : (
                     <button onClick={() => { setStep(isViewingToday ? 6 : 10); setFeedback(null); setInputVal(''); setCurrentAnalysisItems([]); }} className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">Confirmar</button>
                   )}
                 </div>
               )}
            </div>
          )}

          {step === 8 && (
            <div className="flex flex-col h-[75vh] animate-in fade-in">
               <button onClick={() => setStep(6)} className="text-rose-400 font-black text-[10px] uppercase tracking-widest mb-4 p-2 -ml-2">← Home</button>
               <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-6">
                 {chatMessages.length === 0 && (
                   <div className="text-center py-10 px-6 opacity-40">
                      <p className="text-sm font-medium">Estou aqui para tirar suas dúvidas com carinho. Como posso ajudar? 🌸</p>
                   </div>
                 )}
                 {chatMessages.map((msg, i) => (
                   <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-rose-600 text-white rounded-br-none' : 'bg-slate-900/60 border border-white/5 text-slate-100 rounded-bl-none shadow-sm'}`}>
                       {msg.text}
                     </div>
                   </div>
                 ))}
                 <div ref={chatEndRef} />
               </div>
               <div className="bg-slate-900 border border-white/10 p-3 rounded-[2rem] flex gap-2 backdrop-blur-md">
                 <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Pergunte qualquer coisa..." className="flex-1 bg-transparent px-4 outline-none text-sm text-white" />
                 <button onClick={handleSendMessage} className="bg-gradient-to-r from-rose-500 to-pink-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95 transition-transform shadow-lg shadow-rose-500/10">✨</button>
               </div>
            </div>
          )}

          {step === 11 && (
            <div className="space-y-6 animate-in fade-in pb-10">
               <button onClick={() => setStep(6)} className="text-rose-400 font-black text-[10px] uppercase tracking-widest p-2 -ml-2">← Home</button>
               <h2 className="text-3xl font-black tracking-tighter text-white">Sua Jornada</h2>
               
               <div className="grid grid-cols-1 gap-4">
                  {/* Resumo de Perda */}
                  <div className="bg-gradient-to-br from-rose-500 to-pink-500 rounded-[2.5rem] p-8 shadow-xl shadow-rose-500/20 flex items-center justify-between">
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Progresso Total</p>
                        <h3 className="text-4xl font-black text-white">
                           {getWeightLossStats().diff > 0 ? '+' : ''}{getWeightLossStats().diff.toFixed(1)} <span className="text-sm opacity-80">kg</span>
                        </h3>
                     </div>
                     <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-3xl shadow-inner">
                        {getWeightLossStats().diff <= 0 ? '✨' : '🔥'}
                     </div>
                  </div>

                  <div className={`border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center ${getBMICategory(calculateBMI()).bg} backdrop-blur-sm cursor-pointer active:scale-[0.98] transition-transform shadow-xl`} onClick={() => setIsWeightModalOpen(true)}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Índice IMC (Peso: {userData.weight}kg)</p>
                    <span className="text-6xl font-black text-white">{calculateBMI().toFixed(1)}</span>
                    <span className={`text-sm font-black uppercase mt-3 ${getBMICategory(calculateBMI()).color}`}>{getBMICategory(calculateBMI()).label}</span>
                    <p className="mt-4 text-[8px] font-black uppercase text-rose-400/60 tracking-widest">Toque para atualizar seu peso</p>
                  </div>

                  <div className="bg-slate-900/60 border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-xl backdrop-blur-md">
                    <div className="flex justify-between items-center">
                       <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Histórico de Peso</h3>
                       <button onClick={() => setIsWeightModalOpen(true)} className="text-[8px] font-black bg-white/5 border border-white/10 text-slate-300 px-3 py-1.5 rounded-full uppercase tracking-widest active:bg-white/10">Adicionar</button>
                    </div>
                    
                    <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                       {weightHistory.length === 0 ? (
                         <p className="text-xs text-slate-500 italic text-center py-6">Inicie sua jornada hoje! 🌸</p>
                       ) : (
                         weightHistory.map((log, idx) => {
                           // Como a lista está ordenada por data descendente, o registro anterior (mais antigo) é o idx + 1
                           const prev = weightHistory[idx + 1];
                           const diff = prev ? log.weight - prev.weight : 0;
                           return (
                             <div key={idx} className="flex justify-between items-center bg-white/5 p-5 rounded-[2rem] border border-white/5 hover:border-rose-500/20 transition-colors">
                                <div className="flex flex-col">
                                   <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{formatDateLabel(log.date)}</span>
                                   <span className="text-xl font-black text-white">{log.weight}<span className="text-[10px] ml-1 text-slate-500">kg</span></span>
                                </div>
                                {idx !== weightHistory.length - 1 ? (
                                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 ${diff < 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : diff > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
                                     <span>{diff > 0 ? '▲' : diff < 0 ? '▼' : '●'}</span>
                                     {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} kg
                                  </div>
                                ) : (
                                   <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest bg-white/5 px-3 py-1 rounded-full">Inicial</span>
                                )}
                             </div>
                           );
                         })
                       )}
                    </div>

                    <div className="pt-6 border-t border-white/5 space-y-4">
                       <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 text-center">Peso Recomendado</p>
                       <div className="flex items-center justify-around">
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
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-white/5 rounded-[2.5rem] p-8 space-y-4 backdrop-blur-md">
                       <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 text-center">Análise da Nutri IA</p>
                       {parseFloat(userData.weight) > getWeightRange().max ? (
                         <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
                            <span className="text-3xl">🧘‍♀️</span>
                            <p className="text-sm font-medium text-rose-100 leading-relaxed">Focando em reduzir <span className="text-rose-400 font-black">{(parseFloat(userData.weight) - getWeightRange().max).toFixed(1)}kg</span> com leveza e paciência.</p>
                         </div>
                       ) : parseFloat(userData.weight) < getWeightRange().min ? (
                         <div className="bg-violet-500/10 border border-violet-500/20 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
                            <span className="text-3xl">💪</span>
                            <p className="text-sm font-medium text-violet-100 leading-relaxed">Podemos nutrir seu corpo para ganhar <span className="text-violet-400 font-black">{(getWeightRange().min - parseFloat(userData.weight)).toFixed(1)}kg</span> de massa magra.</p>
                         </div>
                       ) : (
                         <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-3xl flex items-center gap-4 shadow-sm">
                            <span className="text-3xl">✨</span>
                            <p className="text-sm font-medium text-rose-100 leading-relaxed">Maravilhosa! Você está no seu <span className="text-rose-400 font-black">melhor equilíbrio</span>. Vamos focar em manter essa energia!</p>
                         </div>
                       )}
                  </div>
               </div>

               <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-8 space-y-4">
                 <div className="flex items-center gap-3">
                   <span className="text-2xl">🌿</span>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mensagem de Hoje</p>
                 </div>
                 <p className="text-xs leading-relaxed text-slate-300 font-medium italic">
                   "Ame seu processo. Cada refeição equilibrada é um ato de carinho com você mesma. Priorize proteínas e vegetais coloridos para brilhar!"
                 </p>
               </div>
            </div>
          )}
        </main>

        <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex items-center justify-around px-4 z-[150] shadow-2xl">
          <button onClick={() => { setStep(6); setSelectedDate(new Date().toISOString().split('T')[0]); }} className={`flex flex-col items-center gap-1 transition-colors ${step === 6 ? 'text-rose-400' : 'text-slate-600'}`}>
            <span className="text-xl">🏠</span>
            <span className="text-[7px] font-black uppercase tracking-tighter">Início</span>
          </button>
          <button onClick={() => setStep(10)} className={`flex flex-col items-center gap-1 transition-colors ${step === 10 ? 'text-rose-400' : 'text-slate-600'}`}>
            <span className="text-xl">📅</span>
            <span className="text-[7px] font-black uppercase tracking-tighter">Diário</span>
          </button>
          <div className="relative -top-1">
            <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="w-16 h-16 bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-[1.8rem] flex items-center justify-center font-black text-3xl shadow-xl shadow-rose-500/20 active:scale-90 transition-transform">+</button>
          </div>
          <button onClick={() => setStep(11)} className={`flex flex-col items-center gap-1 transition-colors ${step === 11 ? 'text-rose-400' : 'text-slate-600'}`}>
            <span className="text-xl">📈</span>
            <span className="text-[7px] font-black uppercase tracking-tighter">Saúde</span>
          </button>
          <button onClick={() => setStep(8)} className={`flex flex-col items-center gap-1 transition-colors ${step === 8 ? 'text-rose-400' : 'text-slate-600'}`}>
            <span className="text-xl">💬</span>
            <span className="text-[7px] font-black uppercase tracking-tighter">Chat</span>
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-white font-sans overflow-y-auto">
      {step === 1 && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80')] bg-cover bg-center transition-transform duration-[30s] scale-110 animate-pulse-slow">
             <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/70 to-transparent"></div>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-end p-10 pb-20 text-center space-y-6">
            <h1 className="text-6xl font-black tracking-tighter">Nutri<span className="text-rose-400">Amiga</span></h1>
            <p className="text-slate-300 text-lg font-medium italic">Seu autocuidado, em cada detalhe. ✨</p>
            <button onClick={() => setStep(2)} className="bg-gradient-to-r from-rose-500 to-pink-500 text-white py-6 rounded-[2.5rem] font-black text-xl uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-rose-500/20">Começar Jornada</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-10 tracking-tighter text-white">Olá! Como posso te chamar?</h2>
          <input type="text" placeholder="Seu nome..." className="bg-white/5 border-2 border-white/5 p-6 rounded-[2rem] text-xl focus:border-rose-500/50 outline-none text-white transition-colors" value={userData.name} onChange={(e) => setUserData({...userData, name: e.target.value})} />
          <button onClick={() => {if(userData.name.trim()) setStep(3)}} disabled={!userData.name.trim()} className="bg-rose-500 text-white py-6 rounded-[2.5rem] font-black text-lg mt-auto mb-16 uppercase disabled:opacity-50">Próximo</button>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col pt-20 px-8 pb-10 animate-in slide-in-from-right">
          <h2 className="text-3xl font-black mb-8 tracking-tighter text-white">Sobre você...</h2>
          <div className="space-y-6 mb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Nascimento</label>
              <input type="date" value={onboardingBirthDate} onChange={(e) => setOnboardingBirthDate(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-white" style={{ colorScheme: 'dark' }} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Gênero</label>
              <div className="flex bg-white/5 p-1 rounded-2xl border-2 border-white/5">
                {['Feminino', 'Masculino', 'Outro'].map(g => (
                  <button key={g} onClick={() => setOnboardingGender(g)} className={`flex-1 py-4 text-[10px] font-black rounded-xl transition-all ${onboardingGender === g ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-500'}`}>{g}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Peso (kg)</label>
                <input type="number" placeholder="70" value={onboardingWeight} onChange={(e) => setOnboardingWeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center text-white" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Altura (cm)</label>
                <input type="number" placeholder="165" value={onboardingHeight} onChange={(e) => setOnboardingHeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center text-white" />
              </div>
            </div>
          </div>
          <button onClick={() => { if (onboardingBirthDate && onboardingWeight && onboardingHeight && onboardingGender) setStep(4); }} className="py-6 rounded-[2.5rem] font-black text-lg bg-rose-500 text-white uppercase active:scale-95 transition-transform disabled:opacity-50">Continuar</button>
        </div>
      )}

      {step === 4 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter text-white">Qual seu objetivo?</h2>
          <div className="space-y-4">
            {['Emagrecer com saúde', 'Manter equilíbrio', 'Ganhar massa magra'].map(opt => (
              <button key={opt} onClick={() => { setUserData({...userData, goal: opt}); setStep(4.5); }} className="w-full text-left p-8 rounded-[2rem] bg-white/5 border-2 border-white/5 flex items-center justify-between active:border-rose-500/50 transition-all active:scale-[0.98]">
                <span className="text-lg font-black text-white">{opt}</span>
                <span className="text-2xl">✨</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4.5 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter text-white">Sua rotina...</h2>
          <div className="space-y-4">
            {[
              { id: 'sedentario', label: 'Mais tranquila', factor: 1.2 },
              { id: 'leve', label: 'Moderadamente ativa', factor: 1.375 },
              { id: 'moderado', label: 'Muito ativa', factor: 1.55 },
              { id: 'intenso', label: 'Atleta / Intensa', factor: 1.725 }
            ].map(opt => (
              <button key={opt.id} onClick={() => {
                const base = userData.goal.includes('Emagrecer') ? 22 : userData.goal.includes('massa') ? 35 : 28;
                const weightNum = parseFloat(onboardingWeight) || 60;
                const cGoal = Math.round(weightNum * base * opt.factor);
                const final = { ...userData, weight: onboardingWeight || '60', height: onboardingHeight || '165', gender: onboardingGender || 'Feminino', birthDate: onboardingBirthDate, activityLevel: opt.id as any, calorieGoal: cGoal };
                setUserData(final);
                localStorage.setItem('nutri_user_data', JSON.stringify(final));
                
                // Inicializar histórico com o peso do onboarding
                const initialLog: WeightLog = { date: new Date().toISOString().split('T')[0], weight: weightNum };
                setWeightHistory([initialLog]);
                localStorage.setItem('nutri_weight_history', JSON.stringify([initialLog]));
                
                setStep(5);
              }} className="w-full text-left p-6 rounded-[2rem] bg-white/5 border-2 border-white/5 active:border-rose-500/50 transition-all active:scale-[0.98]">
                <p className="text-lg font-black text-white">{opt.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-12">
          <div className="w-48 h-48 border-[6px] border-rose-500/10 border-t-rose-500 rounded-full animate-spin mb-10 shadow-lg shadow-rose-500/10"></div>
          <h2 className="text-3xl font-black tracking-tighter animate-pulse text-white">Criando seu plano ✨</h2>
          <p className="mt-4 text-slate-400 text-sm">Quase tudo pronto para começarmos.</p>
        </div>
      )}
    </div>
  );
};

export default App;
