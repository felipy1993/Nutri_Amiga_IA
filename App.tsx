
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  sendPasswordResetEmail,
  User
} from "firebase/auth";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCpPGxPicNuc2FTpNfbytfa6-PSSuBLOyE",
  authDomain: "nutriamiga-346b6.firebaseapp.com",
  projectId: "nutriamiga-346b6",
  storageBucket: "nutriamiga-346b6.firebasestorage.app",
  messagingSenderId: "875891828863",
  appId: "1:875891828863:web:51e0bd719cf5b7cb2bf74a",
  measurementId: "G-5JRVZ9QTYC"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

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

import { FoodItem, UserData, ChatMessage, MealRecord, ExerciseRecord, WeightLog } from './types';

// ... (Other imports remain, this block replaces the interfaces)

const App: React.FC = () => {
  // --- States ---
  const [step, setStep] = useState<number>(0);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const [userData, setUserData] = useState<UserData>({
    name: '', birthDate: '', age: '', gender: '', weight: '', height: '', goal: '', activityLevel: 'sedentario', calorieGoal: 2000
  });
  
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [weightHistory, setWeightHistory] = useState<WeightLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [waterGlasses, setWaterGlasses] = useState<number>(0);
  const [dailyTip, setDailyTip] = useState<string>('');
  const [dailyStats, setDailyStats] = useState<Record<string, { water: number, tip: string, messageCount?: number }>>({});

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

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

  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- Helper Functions ---
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => {
        console.log("Full screen prevented:", e);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const getDayLabel = (dateStr: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr === todayStr) return 'Hoje';
    const date = new Date(dateStr + 'T12:00:00');
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days[date.getDay()];
  };

  // ... (keeping existing helper functions)

  // --- Effects --- 
  // (Adding this new effect near other effects, but for simplicity of edit, inserting logic here or I should insert it in the main effect block.
  // Ideally, I should place toggleFullScreen with other functions, and the effect in the Effects section.
  // Because of the contiguous edit constraint, I will just add the function here and the button part later + effect separately if needed.
  // Actually, I can add the effect here if I am careful, but Effects are further down. 
  // Let's add the state and function here, and the effect in a separate block if possible, or I can just assume the user is okay with me not adding the effect if I can't reach it in one block.
  // Wait, I can use multi_replace for this to be clean.)

  // Let's use multi_replace to do it cleanly in one go.
  // 1. Add state variable.
  // 2. Add toggle function.
  // 3. Add useEffect for auto-fullscreen.
  // 4. Add button in header.

// RE-PLANNING:
// I will use multi_replace_file_content.
// Chunk 1: Add state `isFullscreen` (lines 144 approx)
// Chunk 2: Add `toggleFullScreen` function (lines 146 approx)
// Chunk 3: Add `useEffect` for auto-run (lines 364 approx)
// Chunk 4: Add Button in Header (lines 598 approx)

// Let's execute multi_replace_file_content.


  const calculateBMI = () => {
    const w = parseFloat(userData.weight);
    const h = parseFloat(userData.height) / 100;
    return (w && h) ? w / (h * h) : 0;
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-blue-300', bg: 'bg-blue-500/10' };
    if (bmi < 25) return { label: 'Peso ideal ✨', color: 'text-rose-400', bg: 'bg-rose-500/10' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'text-amber-300', bg: 'bg-amber-500/10' };
    return { label: 'Obesidade', color: 'text-red-400', bg: 'bg-red-500/10' };
  };

  const getWeightLossStats = () => {
    if (weightHistory.length < 1) return { initial: 0, current: 0, diff: 0 };
    const initial = weightHistory[weightHistory.length - 1].weight;
    const current = weightHistory[0].weight;
    return { initial, current, diff: current - initial };
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

  const calculateDailyCalories = (dateStr: string) => {
    const consumed = meals.filter(m => m.date === dateStr).reduce((s, m) => s + (m.calories || 0), 0);
    const burned = exercises.filter(e => e.date === dateStr).reduce((s, e) => s + (e.caloriesBurned || 0), 0);
    return { consumed, burned, net: consumed - burned };
  };

  // --- API and Data Functions ---
  const callGemini = async (prompt: string, model: string = 'gemini-3-flash-preview', retries: number = 3): Promise<string> => {
    let lastError: any = null;
    for (let i = 0; i < retries; i++) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
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

  const loadUserData = async (uid: string) => {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const fbData = docSnap.data();
        if (fbData.userData) setUserData(fbData.userData);
        if (fbData.meals) setMeals(fbData.meals);
        if (fbData.exercises) setExercises(fbData.exercises);
        if (fbData.weightHistory) setWeightHistory(fbData.weightHistory);
        if (fbData.dailyStats) setDailyStats(fbData.dailyStats);
        setStep(6);
      } else {
        setStep(1);
      }
    } catch (e) {
      console.error("Erro ao carregar dados", e);
      setStep(1);
    }
  };

  const generateDailyTip = async (date: string) => {
    if (!hasApiKey || !userData.name) return;
    try {
      const prompt = `Gere uma dica de saúde e bem-estar feminina, curta e motivadora para ${userData.name}. Máximo 15 palavras. Use emojis como ✨ ou 🌸.`;
      const text = await callGemini(prompt);
      const tip = text || "Você é sua prioridade hoje! ✨";
      setDailyTip(tip);
      setDailyStats(prev => ({ ...prev, [date]: { ...prev[date], tip: tip } }));
    } catch (e) {
      setDailyTip("Pequenos passos geram grandes transformações!");
    }
  };

  const handleUpdateWeight = () => {
    const val = parseFloat(newWeightInput);
    if (!newWeightInput || isNaN(val)) return;
    const today = new Date().toISOString().split('T')[0];
    const newWeightLog: WeightLog = { date: today, weight: val };
    const updatedUserData = { ...userData, weight: newWeightInput };
    setUserData(updatedUserData);
    const filteredHistory = weightHistory.filter(h => h.date !== today);
    const updatedHistory = [newWeightLog, ...filteredHistory].sort((a,b) => b.date.localeCompare(a.date));
    setWeightHistory(updatedHistory);
    setIsWeightModalOpen(false);
    setNewWeightInput('');
  };

  const updateWater = (val: number) => {
    const newWater = Math.max(0, val);
    setWaterGlasses(newWater);
    setDailyStats(prev => ({
      ...prev,
      [selectedDate]: { ...(prev[selectedDate] || { tip: '' }), water: newWater }
    }));
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatting) return;

    // Limit check
    const todayStr = new Date().toISOString().split('T')[0];
    const currentStats = dailyStats[todayStr] || { water: 0, tip: '', messageCount: 0 };
    const msgCount = currentStats.messageCount || 0;

    if (msgCount >= 15) {
      setChatMessages(prev => [...prev, { role: 'user', text: chatInput }, { role: 'model', text: "🚫 Você atingiu o limite diário de 15 interações com a IA. Volte amanhã para continuar nossa conversa! 🌸" }]);
      setChatInput('');
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      return;
    }

    // Increment count
    setDailyStats(prev => ({
      ...prev,
      [todayStr]: { ...currentStats, messageCount: msgCount + 1 }
    }));

    const userMsg: ChatMessage = { role: 'user', text: chatInput };
    const currentMsgs = [...chatMessages, userMsg];
    setChatMessages(currentMsgs);
    setChatInput('');
    setIsChatting(true);
    try {
      const prompt = `Conversa atual: ${currentMsgs.map(m => `${m.role}: ${m.text}`).join('\n')}\nResponda como a Nutri IA com carinho e precisão.`;
      const text = await callGemini(prompt);
      setChatMessages(prev => [...prev, { role: 'model', text: text || "..." }]);
    } catch (error) { setChatMessages(prev => [...prev, { role: 'model', text: "Muitas requisições agora. Pode tentar novamente em alguns segundos?" }]); }
    finally { setIsChatting(false); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    try {
      if (isResettingPassword) {
        await sendPasswordResetEmail(auth, authEmail);
        setAuthMessage('E-mail de recuperação enviado com sucesso! ✨');
      } else if (isRegistering) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('Este e-mail já está em uso por outra pessoa. Tente entrar em vez de cadastrar.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('A senha é muito fraca. Tente uma senha com pelo menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('O formato do e-mail é inválido.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError('E-mail ou senha incorretos.');
      } else {
        setAuthError(err.message || 'Erro na autenticação');
      }
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    setAuthMessage('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || 'Erro no login com Google');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setStep(-1);
    setIsSettingsOpen(false);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      alert("A instalação automática não está disponível no momento. Verifique se o app já está instalado ou use o menu do seu navegador.");
    }
  };

  // --- Effects ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        loadUserData(user.uid);
      } else {
        setStep(-1);
      }
    });

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (step >= 6 && currentUser) {
      // Auto-fullscreen check
      if (!document.fullscreenElement) {
         try { toggleFullScreen(); } catch (e) {}
      }

      // Debounced Save
      const timer = setTimeout(() => {
        const data = { userData, meals, exercises, weightHistory, dailyStats };
        const docRef = doc(db, "users", currentUser.uid);
        setDoc(docRef, data, { merge: true }).catch(e => console.error("Firebase sync error", e));
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [userData, meals, exercises, weightHistory, dailyStats, step, currentUser]);

  useEffect(() => {
    const apiKey = process.env.API_KEY;
    setHasApiKey(!!(apiKey && apiKey !== 'undefined' && apiKey !== '""' && apiKey !== ''));
  }, []);

  useEffect(() => {
    if (step >= 6) {
      const current = dailyStats[selectedDate] || { water: 0, tip: '' };
      setWaterGlasses(current.water);
      setDailyTip(current.tip);
      if (!current.tip && selectedDate === new Date().toISOString().split('T')[0] && userData.name && hasApiKey) {
        generateDailyTip(selectedDate);
      }
    }
  }, [selectedDate, step, dailyStats, userData.name, hasApiKey]);

  useEffect(() => {
    if (step === 5) {
      const timer = setTimeout(() => setStep(6), 2500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const parseAIResponse = (text: string) => {
    const items: FoodItem[] = [];
    const itemMatches = text.matchAll(/\[ITEM:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\d+)\s*\]/g);
    for (const match of itemMatches) {
      items.push({ name: match[1], weight: match[2], calories: parseInt(match[3]) });
    }
    let totalCal = 0;
    const totalMatch = text.match(/\[TOTAL_CALORIES:\s*(\d+)\]/);
    if (totalMatch) totalCal = parseInt(totalMatch[1]);
    else totalCal = items.reduce((acc, curr) => acc + curr.calories, 0);
    let status: 'verde' | 'amarelo' | 'azul' = 'verde';
    if (text.includes('STATUS: AMARELO')) status = 'amarelo';
    else if (text.includes('STATUS: AZUL')) status = 'azul';
    const feedbackText = text.split('[')[0].trim();
    return { items, totalCal, status, feedback: feedbackText };
  };

  const handleEntryRegistration = async () => {
    if (!inputVal) return;

    // Limit check (Shared Logic)
    const todayStr = new Date().toISOString().split('T')[0];
    const currentStats = dailyStats[todayStr] || { water: 0, tip: '', messageCount: 0 };
    const msgCount = currentStats.messageCount || 0;

    if (msgCount >= 15) {
      setFeedback("🚫 Você atingiu o limite diário de 15 interações com a IA. Volte amanhã! 🌸");
      return;
    }

    // Increment count
    setDailyStats(prev => ({
      ...prev,
      [todayStr]: { ...(prev[todayStr] || currentStats), messageCount: msgCount + 1 }
    }));

    setIsAnalyzing(true);
    try {
      let prompt = "";
      if (mode === 'exercise') prompt = `REGISTRO EXERCÍCIO: O usuário fez "${inputVal}". Informe calorias gastas aproximadas.`;
      else if (mode === 'meal') prompt = `REGISTRO ALIMENTAR: O usuário comeu "${inputVal}" no ${mealTypeContext || 'momento'}. Detalhe cada item com peso e calorias.`;
      else prompt = `GELADEIRA INTELIGENTE: O usuário tem na geladeira: "${inputVal}". Crie uma sugestão de refeição saudável e equilibrada detalhando cada ingrediente usado, peso e calorias.`;
      const text = await callGemini(prompt);
      const parsed = parseAIResponse(text);
      setFeedback(parsed.feedback);
      setCurrentAnalysisItems(parsed.items);
      setCurrentAnalysisTotal(parsed.totalCal);
      setCurrentAnalysisStatus(parsed.status);
      if (mode !== 'suggest') {
        if (mode === 'exercise') {
          const newEx: ExerciseRecord = { id: Date.now().toString(), date: selectedDate, description: inputVal, caloriesBurned: parsed.totalCal };
          setExercises([...exercises, newEx]);
        } else {
          const newMeal: MealRecord = { 
            id: Date.now().toString(), date: selectedDate, type: mealTypeContext || "Lanche", 
            description: inputVal, feedback: parsed.feedback, status: parsed.status, calories: parsed.totalCal, items: parsed.items
          };
          setMeals([...meals, newMeal]);
        }
      }
    } catch (error) { setFeedback("Ops! Tive um problema técnico. Tente novamente em instantes."); }
    finally { setIsAnalyzing(false); }
  };

  const handleConfirmSuggestion = () => {
    if (!feedback) return;
    const isViewingToday = selectedDate === new Date().toISOString().split('T')[0];
    const newMeal: MealRecord = { 
      id: Date.now().toString(), 
      date: selectedDate, 
      type: mealTypeContext || "Lanche", 
      description: `Sugestão IA: ${inputVal}`, 
      feedback: feedback, 
      status: currentAnalysisStatus, 
      calories: currentAnalysisTotal, 
      items: currentAnalysisItems
    };
    setMeals([...meals, newMeal]);
    setStep(isViewingToday ? 6 : 10);
    setFeedback(null);
    setInputVal('');
    setCurrentAnalysisItems([]);
  };

  // Auth Screen UI
  if (step === -1) {
    return (
      <div className="flex flex-col min-h-screen bg-[#020617] text-white p-8 justify-center animate-in fade-in">
        <div className="fixed top-[-10%] left-[-10%] w-[80%] h-[40%] bg-rose-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black tracking-tighter mb-2">Nutri<span className="text-rose-400">Amiga</span></h1>
          <p className="text-slate-400 font-medium italic">Sua jornada saudável começa aqui ✨</p>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4 max-w-sm mx-auto w-full">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">E-mail</label>
            <input 
              type="email" 
              required 
              value={authEmail} 
              onChange={(e) => setAuthEmail(e.target.value)} 
              className="w-full bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] outline-none focus:border-rose-500/30 transition-all" 
              placeholder="seu@email.com" 
            />
          </div>
          
          {!isResettingPassword && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Senha</label>
              <input 
                type="password" 
                required 
                value={authPassword} 
                onChange={(e) => setAuthPassword(e.target.value)} 
                className="w-full bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] outline-none focus:border-rose-500/30 transition-all" 
                placeholder="••••••••" 
              />
            </div>
          )}

          {authError && <p className="text-rose-400 text-[10px] font-bold text-center mt-2 px-4 uppercase tracking-widest leading-relaxed">{authError}</p>}
          {authMessage && <p className="text-emerald-400 text-[10px] font-bold text-center mt-2 px-4 uppercase tracking-widest leading-relaxed">{authMessage}</p>}
          
          <button type="submit" className="w-full bg-rose-500 text-white py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-[0.98] transition-all">
            {isResettingPassword ? 'Enviar Link de Recuperação' : isRegistering ? 'Criar Minha Conta' : 'Entrar Agora'}
          </button>
        </form>

        <div className="max-w-sm mx-auto w-full mt-6 space-y-4">
          {!isResettingPassword && (
            <>
              <div className="relative flex py-5 items-center"><div className="flex-grow border-t border-white/5"></div><span className="flex-shrink mx-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">Ou</span><div className="flex-grow border-t border-white/5"></div></div>
              <button onClick={handleGoogleAuth} className="w-full bg-white/5 border-2 border-white/5 py-5 rounded-[2rem] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Entrar com Google
              </button>
            </>
          )}

          <div className="flex flex-col items-center gap-4 mt-4">
            {!isResettingPassword ? (
              <>
                <button onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); setAuthMessage(''); }} className="text-rose-400 font-black text-[10px] uppercase tracking-widest">
                  {isRegistering ? 'Já tenho conta? Fazer Login' : 'Não tem conta? Cadastrar Grátis'}
                </button>
                {!isRegistering && (
                  <button onClick={() => { setIsResettingPassword(true); setAuthError(''); setAuthMessage(''); }} className="text-slate-500 font-black text-[10px] uppercase tracking-widest">
                    Esqueci minha senha
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => { setIsResettingPassword(false); setAuthError(''); setAuthMessage(''); }} className="text-rose-400 font-black text-[10px] uppercase tracking-widest">
                Voltar para o Login
              </button>
            )}
          </div>
        </div>
        <p className="mt-8 text-[10px] text-white font-bold text-center max-w-sm px-4 uppercase tracking-wider leading-relaxed relative z-10">
          Nota: A IA pode cometer erros. As sugestões não substituem o aconselhamento médico profissional. Use com responsabilidade.
        </p>
      </div>
    );
  }

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
            <p className="text-slate-400 text-[10px] mt-1 font-bold uppercase tracking-[0.2em] opacity-60">Olá, {userData.name.split(' ')[0] || currentUser?.email?.split('@')[0]} ✨</p>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleFullScreen} className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-transform">
               {!isFullscreen ? (
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
               ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
               )}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-slate-400 border border-white/10 active:scale-95 transition-transform">
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </header>

        {isSettingsOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl animate-in zoom-in-95">
               <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black text-white">Ajustes</h2><button onClick={() => setIsSettingsOpen(false)} className="text-slate-500 text-xl p-2">✕</button></div>
               <div className="space-y-4">
                 <button onClick={handleInstallClick} className="w-full bg-white/5 border border-white/10 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-lg shadow-black/20">
                    📲 INSTALAR NO CELULAR
                 </button>
                 <button onClick={handleSignOut} className="w-full bg-rose-500/10 border border-rose-500/30 text-rose-400 p-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-transform">
                    SAIR DA CONTA
                 </button>
               </div>
            </div>
          </div>
        )}

        {showInstallGuide && (
          <div className="fixed inset-0 z-[300] flex items-end justify-center p-6 sm:items-center">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowInstallGuide(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl animate-in slide-in-from-bottom duration-300">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-white">Como Instalar</h2>
                <button onClick={() => setShowInstallGuide(false)} className="text-slate-500 text-xl p-2">✕</button>
              </div>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl">🍎</span>
                    <div>
                      <p className="text-sm font-bold text-white">No iPhone / iOS</p>
                      <p className="text-xs text-slate-400">Toque no ícone de <span className="text-rose-400 font-bold">Compartilhar</span> e depois em <span className="text-rose-400 font-bold">'Adicionar à Tela de Início'</span>.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="text-2xl">🤖</span>
                    <div>
                      <p className="text-sm font-bold text-white">No Android</p>
                      <p className="text-xs text-slate-400">Toque nos <span className="text-rose-400 font-bold">três pontinhos</span> no canto superior e selecione <span className="text-rose-400 font-bold">'Instalar Aplicativo'</span>.</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowInstallGuide(false)} className="w-full bg-rose-500 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95 transition-transform">Entendi ✨</button>
              </div>
            </div>
          </div>
        )}

        {isWeightModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setIsWeightModalOpen(false)}></div>
            <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl animate-in zoom-in-95">
               <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black text-white">Atualizar Peso</h2><button onClick={() => setIsWeightModalOpen(false)} className="text-slate-500 text-xl p-2">✕</button></div>
               <div className="space-y-6">
                 <div className="relative">
                   <input type="number" placeholder={userData.weight} value={newWeightInput} onChange={(e) => setNewWeightInput(e.target.value)} className="w-full bg-white/5 border-2 border-white/10 p-6 rounded-[1.5rem] text-2xl font-black text-center outline-none focus:border-rose-500/50 transition-colors" />
                   <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-500 uppercase text-xs">kg</span>
                 </div>
                 <button onClick={handleUpdateWeight} className="w-full bg-rose-500 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform shadow-lg shadow-rose-500/20">Salvar Novo Peso 🌸</button>
               </div>
            </div>
          </div>
        )}

        <main className="p-6 space-y-6 max-w-md mx-auto w-full flex-1">
          {step === 6 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
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
                    <button onClick={() => updateWater(waterGlasses - 1)} className="w-8 h-8 rounded-full bg-white/5 font-black active:bg-white/10">-</button>
                    <span className="text-2xl font-black">💧 {waterGlasses}</span>
                    <button onClick={() => updateWater(waterGlasses + 1)} className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 font-black active:bg-violet-500/30">+</button>
                  </div>
                </section>
                <section onClick={() => setIsWeightModalOpen(true)} className="bg-slate-900/40 border border-white/5 p-6 rounded-[2rem] text-center space-y-2 cursor-pointer active:scale-95 transition-transform group">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400">Peso Atual</h4>
                  <div className="flex items-baseline justify-center gap-1"><span className="text-2xl font-black">{userData.weight}</span><span className="text-xs font-black text-slate-500">kg</span></div>
                </section>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 active:bg-rose-500/10 transition-colors">
                    <span className="text-3xl">🥑</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">Já comi</span>
                 </button>
                 <button onClick={() => { setMode('suggest'); setStep(9); }} className="bg-violet-500/5 border border-violet-500/10 p-6 rounded-[2.5rem] flex flex-col items-center gap-2 active:bg-violet-500/10 transition-colors">
                    <span className="text-3xl">🧊</span>
                    <span className="text-[10px) font-black uppercase tracking-widest text-slate-100">O que comer?</span>
                 </button>
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-6 animate-in fade-in pb-20">
               <div className="flex justify-between items-center"><h2 className="text-2xl font-black tracking-tighter">Diário</h2><p className="text-sm font-black text-rose-400">{stats.net} kcal líquidos</p></div>
               <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                 {getWeekDays().map(dateStr => (
                   <button key={dateStr} onClick={() => setSelectedDate(dateStr)} className={`flex flex-col items-center min-w-[65px] p-4 rounded-3xl border transition-all ${selectedDate === dateStr ? 'bg-rose-500 border-rose-500 shadow-lg shadow-rose-500/20' : 'bg-slate-900/40 border-white/5'}`}>
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
                       <div className="flex justify-between items-center mb-3"><h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{type}</h4>{rec && <span className="text-[10px] font-black text-rose-400">{rec.calories} kcal</span>}</div>
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
                       ) : <p className="text-[9px] font-black text-rose-400/50 uppercase tracking-widest">+ Adicionar</p>}
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
                   <button onClick={() => { setMode('meal'); setFeedback(null); }} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${mode === 'meal' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-500'}`}>Já comi</button>
                   <button onClick={() => { setMode('suggest'); setFeedback(null); }} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${mode === 'suggest' ? 'bg-violet-500 text-white shadow-lg' : 'text-slate-500'}`}>Geladeira IA</button>
                 </div>
                 <h2 className="text-2xl font-black tracking-tighter text-white">{mode === 'suggest' ? "O que tem em casa?" : "O que você comeu?"}</h2>
                 <textarea value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder={mode === 'suggest' ? "Ex: Frango, espinafre, batata doce..." : "Descreva seu prato aqui..."} className="w-full h-32 bg-black/40 border-2 border-white/5 rounded-3xl p-6 outline-none text-white resize-none focus:border-rose-500/30 transition-colors" />
                 <button onClick={handleEntryRegistration} disabled={isAnalyzing || !inputVal.trim()} className={`w-full py-5 rounded-3xl font-black text-xs uppercase tracking-widest disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg ${mode === 'suggest' ? 'bg-violet-500 text-white shadow-violet-500/20' : 'bg-rose-500 text-white shadow-rose-500/20'}`}>
                    {isAnalyzing ? 'Analisando...' : mode === 'suggest' ? 'Gerar Sugestão ✨' : 'Registrar Agora'}
                 </button>
               </div>
               {feedback && (
                 <div className="bg-slate-900/60 border border-white/5 p-8 rounded-[2.5rem] space-y-6 animate-in fade-in shadow-2xl backdrop-blur-md">
                   <div className="space-y-4">
                     <div className="flex items-center gap-3"><span className="text-2xl">👩‍⚕️</span><h4 className="text-[10px] font-black uppercase tracking-widest text-rose-400">Nutri IA diz:</h4></div>
                     <p className="text-sm font-medium leading-relaxed italic text-slate-200">"{feedback}"</p>
                     <div className="space-y-2 pt-4 border-t border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Detalhes Nutricionais:</p>
                        <div className="space-y-2">
                          {currentAnalysisItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-2xl border border-white/5">
                              <div><p className="text-[11px] font-bold text-white">{item.name}</p><p className="text-[9px] text-slate-500">{item.weight}</p></div>
                              <p className="text-[10px] font-black text-rose-400">{item.calories} kcal</p>
                            </div>
                          ))}
                          <div className="flex justify-between items-center p-3 mt-2 bg-rose-500/10 rounded-2xl border border-rose-500/10"><span className="text-[10px] font-black uppercase tracking-widest">Total</span><span className="text-sm font-black text-rose-400">{currentAnalysisTotal} kcal</span></div>
                        </div>
                     </div>
                   </div>
                   {mode === 'suggest' ? (
                     <div className="grid grid-cols-2 gap-3"><button onClick={() => { setFeedback(null); setInputVal(''); }} className="py-4 border border-white/10 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest">Outra idéia</button><button onClick={handleConfirmSuggestion} className="py-4 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20">Vou comer!</button></div>
                   ) : <button onClick={() => { setStep(isViewingToday ? 6 : 10); setFeedback(null); setInputVal(''); setCurrentAnalysisItems([]); }} className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg">Confirmar</button>}
                 </div>
               )}
            </div>
          )}

          {step === 8 && (
            <div className="flex flex-col h-[75vh] animate-in fade-in">
               <button onClick={() => setStep(6)} className="text-rose-400 font-black text-[10px] uppercase tracking-widest mb-4 p-2 -ml-2">← Home</button>
               <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-6">
                 {chatMessages.length === 0 && <div className="text-center py-10 px-6 opacity-40"><p className="text-sm font-medium">Como posso ajudar hoje? 🌸</p></div>}
                 {chatMessages.map((msg, i) => (
                   <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-5 rounded-[2rem] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-rose-600 text-white rounded-br-none' : 'bg-slate-900/60 border border-white/5 text-slate-100 rounded-bl-none shadow-sm'}`}>{msg.text}</div></div>
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
                  <div className="bg-gradient-to-br from-rose-500 to-pink-500 rounded-[2.5rem] p-8 shadow-xl shadow-rose-500/20 flex items-center justify-between">
                     <div><p className="text-[10px] font-black uppercase tracking-widest text-white/70">Progresso Total</p><h3 className="text-4xl font-black text-white">{getWeightLossStats().diff > 0 ? '+' : ''}{getWeightLossStats().diff.toFixed(1)} <span className="text-sm opacity-80">kg</span></h3></div>
                  </div>
                  <div className={`border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center ${getBMICategory(calculateBMI()).bg} backdrop-blur-sm cursor-pointer shadow-xl`} onClick={() => setIsWeightModalOpen(true)}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Índice IMC (Peso: {userData.weight}kg)</p>
                    <span className="text-6xl font-black text-white">{calculateBMI().toFixed(1)}</span>
                    <span className={`text-sm font-black uppercase mt-3 ${getBMICategory(calculateBMI()).color}`}>{getBMICategory(calculateBMI()).label}</span>
                  </div>
                  <div className="bg-slate-900/60 border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-xl backdrop-blur-md">
                    <div className="flex justify-between items-center"><h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Histórico de Peso</h3><button onClick={() => setIsWeightModalOpen(true)} className="text-[8px] font-black bg-white/5 border border-white/10 text-slate-300 px-3 py-1.5 rounded-full uppercase tracking-widest active:bg-white/10">Adicionar</button></div>
                    <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                       {weightHistory.length === 0 ? <p className="text-xs text-slate-500 italic text-center py-6">Inicie sua jornada hoje! 🌸</p> : weightHistory.map((log, idx) => {
                           const prev = weightHistory[idx + 1]; const diff = prev ? log.weight - prev.weight : 0;
                           return (
                             <div key={idx} className="flex justify-between items-center bg-white/5 p-5 rounded-[2rem] border border-white/5 hover:border-rose-500/20 transition-colors">
                                <div className="flex flex-col"><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{log.date}</span><span className="text-xl font-black text-white">{log.weight}<span className="text-[10px] ml-1 text-slate-500">kg</span></span></div>
                                {idx !== weightHistory.length - 1 ? <div className={`px-4 py-1.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 ${diff < 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : diff > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}><span>{diff > 0 ? '▲' : diff < 0 ? '▼' : '●'}</span>{diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} kg</div> : <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest bg-white/5 px-3 py-1 rounded-full">Inicial</span>}
                             </div>
                           );
                         })}
                    </div>
                  </div>
               </div>
            </div>
          )}
          <div className="pb-32 px-6 flex justify-center opacity-40 hover:opacity-100 transition-opacity">
            <p className="text-[9px] font-bold text-center text-white max-w-[200px] uppercase tracking-wider leading-relaxed">
              Nota: A IA pode cometer erros. As sugestões não substituem o aconselhamento médico profissional.
            </p>
          </div>
        </main>

        <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] flex items-center justify-around px-4 z-[150] shadow-2xl">
          <button onClick={() => { setStep(6); setSelectedDate(new Date().toISOString().split('T')[0]); }} className={`flex flex-col items-center gap-1 transition-colors ${step === 6 ? 'text-rose-400' : 'text-slate-600'}`}><span className="text-xl">🏠</span><span className="text-[7px] font-black uppercase tracking-tighter">Início</span></button>
          <button onClick={() => setStep(10)} className={`flex flex-col items-center gap-1 transition-colors ${step === 10 ? 'text-rose-400' : 'text-slate-600'}`}><span className="text-xl">📅</span><span className="text-[7px] font-black uppercase tracking-tighter">Diário</span></button>
          <div className="relative -top-1"><button onClick={() => { setMode('meal'); setMealTypeContext(null); setStep(9); }} className="w-16 h-16 bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-[1.8rem] flex items-center justify-center font-black text-3xl shadow-xl shadow-rose-500/20 active:scale-90 transition-transform">+</button></div>
          <button onClick={() => setStep(11)} className={`flex flex-col items-center gap-1 transition-colors ${step === 11 ? 'text-rose-400' : 'text-slate-600'}`}><span className="text-xl">📈</span><span className="text-[7px] font-black uppercase tracking-tighter">Saúde</span></button>
          <button onClick={() => setStep(8)} className={`flex flex-col items-center gap-1 transition-colors ${step === 8 ? 'text-rose-400' : 'text-slate-600'}`}><span className="text-xl">💬</span><span className="text-[7px] font-black uppercase tracking-tighter">Chat</span></button>
        </nav>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-white font-sans overflow-y-auto">
      {step === 1 && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80')] bg-cover bg-center transition-transform duration-[30s] scale-110 animate-pulse-slow"><div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/70 to-transparent"></div></div>
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
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Nascimento</label><input type="date" value={onboardingBirthDate} onChange={(e) => setOnboardingBirthDate(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-white" style={{ colorScheme: 'dark' }} /></div>
            <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Gênero</label>
              <div className="flex bg-white/5 p-1 rounded-2xl border-2 border-white/5">
                {['Feminino', 'Masculino', 'Outro'].map(g => <button key={g} onClick={() => setOnboardingGender(g)} className={`flex-1 py-4 text-[10px] font-black rounded-xl transition-all ${onboardingGender === g ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-500'}`}>{g}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Peso (kg)</label><input type="number" placeholder="70" value={onboardingWeight} onChange={(e) => setOnboardingWeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center text-white" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase ml-4 tracking-widest">Altura (cm)</label><input type="number" placeholder="165" value={onboardingHeight} onChange={(e) => setOnboardingHeight(e.target.value)} className="bg-white/5 border-2 border-white/5 p-5 rounded-[1.5rem] w-full outline-none text-center text-white" /></div>
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
              <button key={opt} onClick={() => { setUserData({...userData, goal: opt}); setStep(4.5); }} className="w-full text-left p-8 rounded-[2rem] bg-white/5 border-2 border-white/5 flex items-center justify-between active:border-rose-500/50 transition-all active:scale-[0.98]"><span className="text-lg font-black text-white">{opt}</span><span className="text-2xl">✨</span></button>
            ))}
          </div>
        </div>
      )}
      {step === 4.5 && (
        <div className="flex-1 flex flex-col pt-24 px-10 animate-in slide-in-from-right">
          <h2 className="text-4xl font-black mb-12 tracking-tighter text-white">Sua rotina...</h2>
          <div className="space-y-4">
            {[{ id: 'sedentario', label: 'Mais tranquila', factor: 1.2 }, { id: 'leve', label: 'Moderadamente ativa', factor: 1.375 }, { id: 'moderado', label: 'Muito ativa', factor: 1.55 }, { id: 'intenso', label: 'Atleta / Intensa', factor: 1.725 }].map(opt => (
              <button key={opt.id} onClick={() => {
                const base = userData.goal.includes('Emagrecer') ? 22 : userData.goal.includes('massa') ? 35 : 28; const weightNum = parseFloat(onboardingWeight) || 60; const cGoal = Math.round(weightNum * base * opt.factor);
                const final = { ...userData, name: userData.name || currentUser?.displayName || 'Amiga', weight: onboardingWeight || '60', height: onboardingHeight || '165', gender: onboardingGender || 'Feminino', birthDate: onboardingBirthDate, activityLevel: opt.id as any, calorieGoal: cGoal };
                setUserData(final); setWeightHistory([{ date: new Date().toISOString().split('T')[0], weight: weightNum }]); setStep(5);
              }} className="w-full text-left p-6 rounded-[2rem] bg-white/5 border-2 border-white/5 active:border-rose-500/50 transition-all active:scale-[0.98]"><p className="text-lg font-black text-white">{opt.label}</p></button>
            ))}
          </div>
        </div>
      )}
      {step === 5 && (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-12">
          <div className="w-48 h-48 border-[6px] border-rose-500/10 border-t-rose-500 rounded-full animate-spin mb-10 shadow-lg shadow-rose-500/10"></div>
          <h2 className="text-3xl font-black tracking-tighter animate-pulse text-white">Criando seu plano ✨</h2>
        </div>
      )}
    </div>
  );
};

export default App;
