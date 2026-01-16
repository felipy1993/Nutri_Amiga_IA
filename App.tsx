
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { db, auth, googleProvider } from './firebaseConfig';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  User,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';

const SYSTEM_INSTRUCTION = `Você é uma Inteligência Artificial que atua como guia alimentar e de saúde diário.
Seu papel é ajudar pessoas comuns a comerem melhor e se manterem ativas.
Responda sempre de forma curta, motivadora e humana. Use emojis.
REGRAS:
- SEMPRE retorne no final do texto a tag: [STATUS:COR][CALORIES:NUMERO][TYPE:MEAL|EXERCISE]`;

interface UserData {
  name: string;
  weight: string;
  height: string;
  goal: string;
  activityLevel: string;
  calorieGoal: number;
  onboardingComplete: boolean;
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

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [isLoggingWithGoogle, setIsLoggingWithGoogle] = useState(false);

  // App Core State
  const [step, setStep] = useState<number>(0);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [waterGlasses, setWaterGlasses] = useState(0);

  // UI State
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'profile'>('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [mealTypeContext, setMealTypeContext] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mode, setMode] = useState<'meal' | 'exercise'>('meal');

  // Onboarding temporary
  const [onboardingName, setOnboardingName] = useState('');
  const [onboardingWeight, setOnboardingWeight] = useState('');
  const [onboardingHeight, setOnboardingHeight] = useState('');

  // Monitorar Autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists() && userDoc.data().onboardingComplete) {
          setUserData(userDoc.data() as UserData);
          setStep(6); // Home
        } else {
          setOnboardingName(firebaseUser.displayName || '');
          setStep(1); // Onboarding
        }
      } else {
        setStep(-1); // Login
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Monitorar Dados (Refeições e Stats)
  useEffect(() => {
    if (!user || step < 6) return;

    const qMeals = query(
      collection(db, "users", user.uid, "meals"), 
      where("date", "==", selectedDate)
    );
    const unsubMeals = onSnapshot(qMeals, (snapshot) => {
      setMeals(snapshot.docs.map(d => d.data() as MealRecord));
    });

    const qExercises = query(
      collection(db, "users", user.uid, "exercises"),
      where("date", "==", selectedDate)
    );
    const unsubEx = onSnapshot(qExercises, (snapshot) => {
      setExercises(snapshot.docs.map(d => d.data() as ExerciseRecord));
    });

    const unsubStats = onSnapshot(doc(db, "users", user.uid, "daily_stats", selectedDate), (docSnap) => {
      if (docSnap.exists()) setWaterGlasses(docSnap.data().water || 0);
      else setWaterGlasses(0);
    });

    return () => { unsubMeals(); unsubEx(); unsubStats(); };
  }, [user, step, selectedDate]);

  const handleGoogleLogin = async () => {
    setIsLoggingWithGoogle(true);
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Erro Firebase Auth:", err.code, err.message);
      if (err.code === 'auth/popup-blocked') {
        setAuthError("Pop-up bloqueado pelo navegador. Por favor, habilite-o.");
      } else if (err.code === 'auth/unauthorized-domain') {
        setAuthError("Este domínio não está autorizado no Firebase. Adicione localhost/seu domínio no console.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Usuário fechou o popup, não precisa mostrar erro grande
      } else {
        setAuthError("Não foi possível conectar com o Google. Tente e-mail e senha.");
      }
    } finally {
      setIsLoggingWithGoogle(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!email || !password) return setAuthError("Preencha e-mail e senha.");
    try {
      if (isRegistering) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') setAuthError("Credenciais inválidas.");
      else if (err.code === 'auth/email-already-in-use') setAuthError("E-mail já cadastrado.");
      else setAuthError("Ocorreu um erro. Tente novamente.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsSettingsOpen(false);
    setUserData(null);
    setStep(-1);
    setActiveTab('home');
  };

  // Implementação da recuperação de senha via Firebase
  const handleForgotPassword = async () => {
    if (!email) {
      setAuthError("Insira seu e-mail para recuperar a senha.");
      return;
    }
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setAuthError("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (err: any) {
      setAuthError("Erro ao enviar e-mail de recuperação. Verifique o endereço digitado.");
    }
  };

  const handleOnboardingSubmit = async () => {
    if (!user) return;
    const weightNum = parseFloat(onboardingWeight) || 70;
    const data: UserData = {
      name: onboardingName,
      weight: onboardingWeight,
      height: onboardingHeight,
      goal: 'Saúde',
      activityLevel: 'moderado',
      calorieGoal: Math.round(weightNum * 33), // Cálculo simplificado (33kcal/kg)
      onboardingComplete: true
    };
    await setDoc(doc(db, "users", user.uid), data);
    setUserData(data);
    setStep(6);
  };

  const handleEntryRegistration = async () => {
    if (!inputVal || !user || !userData) return;
    setIsAnalyzing(true);
    try {
      // Inicializando a API conforme as diretrizes
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let prompt = mode === 'exercise' 
        ? `EXERCÍCIO: Fiz "${inputVal}". Peso: ${userData.weight}kg. [STATUS:VERDE][CALORIES:NUM][TYPE:EXERCISE]`
        : `REGISTRO: Comeu "${inputVal}" no ${mealTypeContext || 'Lanche'}. [STATUS:COR][CALORIES:NUM][TYPE:MEAL]`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      
      // Acessando a propriedade .text corretamente
      const text = response.text || "";
      const cleanedFeedback = text.split('[STATUS:')[0];
      setFeedback(cleanedFeedback);
      
      let val = 0;
      const valMatch = text.match(/\[CALORIES:(\d+)\]/);
      if (valMatch) val = parseInt(valMatch[1]);

      const id = Date.now().toString();
      if (mode === 'exercise') {
        await setDoc(doc(db, "users", user.uid, "exercises", id), { id, date: selectedDate, description: inputVal, caloriesBurned: val || 200 });
      } else {
        let status: 'verde' | 'amarelo' | 'azul' = text.includes('STATUS:AMARELO') ? 'amarelo' : 'verde';
        await setDoc(doc(db, "users", user.uid, "meals", id), { id, date: selectedDate, type: mealTypeContext || "Lanche", description: inputVal, feedback: cleanedFeedback, status, calories: val || 300 });
      }
    } catch (e) {
      setFeedback("Ops! Registrei localmente, mas a análise falhou. 🍎");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateWater = async (val: number) => {
    if (!user) return;
    setWaterGlasses(val);
    await setDoc(doc(db, "users", user.uid, "daily_stats", selectedDate), { water: val }, { merge: true });
  };

  const getWeekDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  };

  if (authLoading) return <div className="flex min-h-screen bg-[#020617] justify-center items-center"><div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div></div>;

  // TELA DE LOGIN
  if (step === -1) {
    return (
      <div className="flex flex-col min-h-screen bg-[#020617] text-white p-8 justify-center items-center relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[120%] h-[70%] bg-emerald-500/10 blur-[150px] rounded-full animate-pulse-slow"></div>
        
        <div className="w-full max-w-sm space-y-8 z-10 animate-in fade-in duration-700">
          <div className="text-center space-y-2">
            <div className="inline-block p-4 bg-emerald-500/10 rounded-3xl mb-4 border border-emerald-500/20 shadow-xl shadow-emerald-500/5">
                <span className="text-4xl">🥗</span>
            </div>
            <h1 className="text-5xl font-black tracking-tighter">Nutri<span className="text-emerald-400">Amiga</span></h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Sua IA de Saúde Pessoal</p>
          </div>

          <div className="glass-card p-8 rounded-[2.5rem] shadow-2xl space-y-6">
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-3">
                <input 
                  type="email" 
                  placeholder="E-mail" 
                  className="w-full bg-black/40 border border-white/5 p-5 rounded-2xl outline-none focus:border-emerald-500/40 transition-all text-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <input 
                  type="password" 
                  placeholder="Senha" 
                  className="w-full bg-black/40 border border-white/5 p-5 rounded-2xl outline-none focus:border-emerald-500/40 transition-all text-sm"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              {authError && <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-[10px] font-black uppercase text-center leading-relaxed">{authError}</div>}

              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
                {isRegistering ? "Criar Conta" : "Entrar"}
              </button>
            </form>

            <div className="flex justify-between items-center px-2">
                <button onClick={() => setIsRegistering(!isRegistering)} className="text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors">
                    {isRegistering ? "Já tenho conta" : "Cadastrar"}
                </button>
                <button onClick={() => handleForgotPassword()} className="text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors">Recuperar Senha</button>
            </div>

            <div className="relative flex items-center gap-4 text-slate-700">
              <div className="flex-1 border-t border-white/5"></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Ou</span>
              <div className="flex-1 border-t border-white/5"></div>
            </div>

            <button 
              onClick={handleGoogleLogin} 
              disabled={isLoggingWithGoogle}
              className="w-full bg-white hover:bg-slate-50 text-black py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl disabled:opacity-50"
            >
              {isLoggingWithGoogle ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin"></div>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Google
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DASHBOARD PRINCIPAL
  if (step >= 6) {
    const consumed = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const burned = exercises.reduce((s, e) => s + (e.caloriesBurned || 0), 0);
    const totalMeta = (userData?.calorieGoal || 2000) + burned;
    const progressPercent = Math.min(100, (consumed / totalMeta) * 100);

    return (
      <div className="flex flex-col min-h-screen bg-[#020617] text-slate-100">
        <header className="px-6 pt-12 pb-6 bg-[#0f172a]/80 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-[100] flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-emerald-400 tracking-tighter uppercase leading-none">Nutri<span className="text-white">Amiga</span></h1>
            <p className="text-slate-500 text-[10px] font-black uppercase opacity-60 mt-1">Olá, {userData?.name.split(' ')[0] || 'Nutri'}</p>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 glass-card rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 transition-transform">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2a2 2 0 0 1-2 2a2 2 0 0 0-2 2v.44a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2a2 2 0 0 1 2 2a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2a2 2 0 0 1 2-2a2 2 0 0 0 2-2v-.44a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2a2 2 0 0 1-2-2a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </header>

        {isSettingsOpen && (activeTab === 'profile' || isSettingsOpen) && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)}></div>
            <div className="glass-card w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl space-y-8 animate-in zoom-in duration-300">
               <div className="flex justify-between items-center">
                 <h2 className="text-xl font-black">Seu Perfil</h2>
                 <button onClick={() => setIsSettingsOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">✕</button>
               </div>
               <div className="space-y-4">
                 <div className="bg-black/40 p-5 rounded-3xl border border-white/5 flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center font-black text-white">
                        {userData?.name[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                        <p className="font-black">{userData?.name}</p>
                        <p className="text-[10px] text-slate-500">{user?.email}</p>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Peso</p>
                        <p className="text-lg font-black">{userData?.weight} kg</p>
                    </div>
                    <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Altura</p>
                        <p className="text-lg font-black">{userData?.height} cm</p>
                    </div>
                 </div>
               </div>
               <button onClick={handleLogout} className="w-full bg-red-500/10 border border-red-500/20 text-red-400 py-5 rounded-2xl font-black text-xs uppercase active:scale-95 transition-all">Sair do NutriAmiga</button>
            </div>
          </div>
        )}

        <main className="p-6 pb-32 space-y-8 max-w-md mx-auto w-full flex-1">
          {activeTab === 'home' && step === 6 && (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              <section className="bg-gradient-to-br from-emerald-600 to-emerald-800 border border-emerald-500/20 rounded-[2.5rem] p-8 shadow-2xl shadow-emerald-500/10 space-y-6">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-emerald-100/60 tracking-widest">Resumo de Hoje</p>
                    <h3 className="text-5xl font-black text-white">{consumed} <span className="text-sm opacity-60 font-medium">kcal</span></h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest">Restante</p>
                    <h4 className="text-2xl font-black text-white">{totalMeta - consumed}</h4>
                  </div>
                </div>
                <div className="h-5 w-full bg-black/20 rounded-full overflow-hidden p-1 shadow-inner">
                  <div className="h-full bg-white rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(255,255,255,0.4)]" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-4">
                <section className="glass-card p-6 rounded-[2rem] text-center space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Água</h4>
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => updateWater(Math.max(0, waterGlasses - 1))} className="w-9 h-9 rounded-2xl bg-white/5 font-black active:bg-white/10 transition-colors">－</button>
                    <span className="text-3xl font-black">{waterGlasses}</span>
                    <button onClick={() => updateWater(waterGlasses + 1)} className="w-9 h-9 rounded-2xl bg-blue-500/20 text-blue-400 font-black">＋</button>
                  </div>
                </section>
                <section className="glass-card p-6 rounded-[2rem] text-center space-y-2 flex flex-col justify-center">
                  <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Atividade</h4>
                  <div className="text-3xl font-black">-{burned} <span className="text-xs text-slate-500 font-medium tracking-normal">kcal</span></div>
                </section>
              </div>

              <div className="grid grid-cols-1 gap-4">
                 <button onClick={() => { setMode('meal'); setStep(9); }} className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[2.5rem] flex items-center justify-between active:scale-95 transition-all group">
                    <div className="flex items-center gap-5">
                        <span className="text-4xl group-hover:scale-110 transition-transform">🥗</span>
                        <div className="text-left">
                            <h4 className="font-black text-emerald-400 text-sm">Registrar Refeição</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Adicionar o que você comeu</p>
                        </div>
                    </div>
                    <span className="text-emerald-500/40 font-black text-2xl">→</span>
                 </button>
                 <button onClick={() => { setMode('exercise'); setStep(9); }} className="bg-blue-500/10 border border-blue-500/20 p-8 rounded-[2.5rem] flex items-center justify-between active:scale-95 transition-all group">
                    <div className="flex items-center gap-5">
                        <span className="text-4xl group-hover:scale-110 transition-transform">🏃‍♂️</span>
                        <div className="text-left">
                            <h4 className="font-black text-blue-400 text-sm">Registrar Exercício</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Contabilizar queima calórica</p>
                        </div>
                    </div>
                    <span className="text-blue-500/40 font-black text-2xl">→</span>
                 </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-500">
               <div className="flex justify-between items-center mb-2">
                 <h2 className="text-2xl font-black">Diário Alimentar</h2>
                 <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={(e) => setSelectedDate(e.target.value)} 
                    className="bg-white/5 border border-white/5 rounded-xl px-3 py-1 text-xs font-black outline-none"
                 />
               </div>
               
               {meals.length === 0 && exercises.length === 0 ? (
                 <div className="glass-card p-12 rounded-[2.5rem] text-center space-y-4 border-dashed border-white/10 opacity-60">
                    <span className="text-5xl block">📝</span>
                    <p className="text-sm font-bold text-slate-400">Nenhum registro para este dia.</p>
                 </div>
               ) : (
                 <div className="space-y-4">
                   {meals.map((meal) => (
                     <div key={meal.id} className="glass-card p-6 rounded-3xl border-l-4 border-emerald-500 flex justify-between items-start gap-4">
                        <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{meal.type}</span>
                                <span className="text-[10px] text-slate-500 font-bold">{meal.calories} kcal</span>
                            </div>
                            <p className="font-bold text-sm leading-snug">"{meal.description}"</p>
                            {meal.feedback && <p className="text-[10px] text-slate-400 italic font-medium leading-relaxed">Nutri: {meal.feedback}</p>}
                        </div>
                        <div className={`w-3 h-3 rounded-full shrink-0 mt-1 ${meal.status === 'verde' ? 'bg-emerald-500' : meal.status === 'amarelo' ? 'bg-yellow-500' : 'bg-blue-500'}`}></div>
                     </div>
                   ))}
                   {exercises.map((ex) => (
                     <div key={ex.id} className="glass-card p-6 rounded-3xl border-l-4 border-blue-500 flex justify-between items-center gap-4">
                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">Treino</span>
                            <p className="font-bold text-sm leading-snug">{ex.description}</p>
                        </div>
                        <span className="text-blue-400 font-black">-{ex.caloriesBurned} kcal</span>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          )}

          {step === 9 && (
            <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500 pb-20 fixed inset-0 z-[160] bg-[#020617] p-8 overflow-y-auto">
               <button onClick={() => setStep(6)} className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.2em] mb-4 p-2">← Voltar</button>
               <div className="glass-card rounded-[2.5rem] p-8 space-y-6 shadow-2xl mt-4">
                 <h2 className="text-3xl font-black tracking-tighter">{mode === 'meal' ? 'O que você comeu?' : 'Qual foi o treino?'}</h2>
                 <textarea 
                    value={inputVal} 
                    onChange={(e) => setInputVal(e.target.value)} 
                    placeholder={mode === 'meal' ? "Ex: 1 pão integral com queijo e suco de laranja..." : "Ex: 20 min de corrida moderada..."}
                    className="w-full h-48 bg-black/40 border border-white/5 rounded-3xl p-6 outline-none text-white resize-none text-sm leading-relaxed placeholder:opacity-30" 
                 />
                 <button 
                    onClick={handleEntryRegistration} 
                    disabled={isAnalyzing || !inputVal} 
                    className="w-full py-6 bg-emerald-500 text-white rounded-3xl font-black text-xs uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-emerald-500/20"
                 >
                    {isAnalyzing ? (
                        <div className="flex items-center justify-center gap-2">
                            <div className="w-3 h-3 bg-white rounded-full animate-bounce"></div>
                            <span>Analisando...</span>
                        </div>
                    ) : 'Salvar no Diário'}
                 </button>
               </div>
               
               {feedback && (
                 <div className="glass-card p-8 rounded-[2.5rem] space-y-5 animate-in zoom-in duration-300">
                   <div className="flex items-center gap-3">
                       <span className="text-2xl">✨</span>
                       <h4 className="text-[11px] font-black uppercase text-emerald-400 tracking-widest">Feedback da Nutri</h4>
                   </div>
                   <p className="text-sm font-medium italic text-slate-300 leading-relaxed">"{feedback}"</p>
                   <button onClick={() => { setStep(6); setFeedback(null); setInputVal(''); }} className="w-full py-4 bg-emerald-500/20 text-emerald-400 rounded-2xl font-black text-[10px] uppercase border border-emerald-500/20">Continuar Jornada</button>
                 </div>
               )}
            </div>
          )}
        </main>

        <nav className="fixed bottom-8 left-6 right-6 h-20 bg-[#0f172a]/95 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] flex items-center justify-around px-4 z-[150] shadow-2xl safe-area-bottom">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'home' ? 'text-emerald-400 scale-110' : 'text-slate-500'}`}>
            <span className="text-xl">{activeTab === 'home' ? '🏘️' : '🏠'}</span>
            <span className="text-[8px] font-black uppercase tracking-tighter">Início</span>
          </button>
          
          <div className="relative -top-10">
            <button 
                onClick={() => { setMode('meal'); setStep(9); }} 
                className="w-16 h-16 bg-emerald-500 text-white rounded-[1.8rem] flex items-center justify-center font-black text-3xl shadow-[0_10px_40px_rgba(16,185,129,0.4)] active:scale-90 transition-transform"
            >
                ＋
            </button>
          </div>

          <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'history' ? 'text-emerald-400 scale-110' : 'text-slate-500'}`}>
            <span className="text-xl">{activeTab === 'history' ? '📑' : '📖'}</span>
            <span className="text-[8px] font-black uppercase tracking-tighter">Diário</span>
          </button>
        </nav>
      </div>
    );
  }

  // ONBOARDING
  return (
    <div className="flex flex-col min-h-screen bg-[#020617] text-white p-8 justify-center items-center relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[100%] h-[60%] bg-blue-500/5 blur-[120px] rounded-full"></div>

      {step === 1 && (
        <div className="w-full max-w-sm space-y-12 text-center animate-in slide-in-from-right duration-500">
           <div className="space-y-4">
               <h2 className="text-5xl font-black tracking-tighter">Seja bem-vinda! 👋</h2>
               <p className="text-slate-400 text-sm leading-relaxed">Antes de começarmos, como você gostaria de ser chamada no app?</p>
           </div>
           <div className="space-y-6">
             <input type="text" placeholder="Nome ou Apelido" className="w-full bg-white/5 border border-white/5 p-6 rounded-[2rem] text-xl outline-none focus:border-emerald-500/40 text-center font-black" value={onboardingName} onChange={e => setOnboardingName(e.target.value)} />
             <button onClick={() => setStep(2)} disabled={!onboardingName} className="w-full bg-emerald-500 py-6 rounded-[2.5rem] font-black uppercase tracking-widest disabled:opacity-50 shadow-xl shadow-emerald-500/10">Continuar</button>
           </div>
        </div>
      )}

      {step === 2 && (
        <div className="w-full max-w-sm space-y-10 animate-in slide-in-from-right duration-500">
           <div className="space-y-4 text-center">
               <h2 className="text-3xl font-black tracking-tighter">Suas Medidas ⚖️</h2>
               <p className="text-slate-400 text-sm">Usamos isso para calcular suas necessidades reais.</p>
           </div>
           <div className="space-y-5">
             <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase text-slate-500 ml-6">Peso (kg)</label>
                     <input type="number" placeholder="70" className="bg-white/5 border border-white/5 p-5 rounded-[2rem] w-full text-center outline-none focus:border-emerald-500/40 font-black text-lg" value={onboardingWeight} onChange={e => setOnboardingWeight(e.target.value)} />
                 </div>
                 <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase text-slate-500 ml-6">Altura (cm)</label>
                     <input type="number" placeholder="170" className="bg-white/5 border border-white/5 p-5 rounded-[2rem] w-full text-center outline-none focus:border-emerald-500/40 font-black text-lg" value={onboardingHeight} onChange={e => setOnboardingHeight(e.target.value)} />
                 </div>
             </div>
             <button onClick={handleOnboardingSubmit} disabled={!onboardingWeight || !onboardingHeight} className="w-full bg-emerald-500 py-6 rounded-[2.5rem] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-emerald-500/10 disabled:opacity-50">Tudo Pronto!</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
