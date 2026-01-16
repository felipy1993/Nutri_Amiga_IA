export interface FoodItem {
  name: string;
  weight: string;
  calories: number;
}

export interface UserData {
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

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface MealRecord {
  id: string;
  date: string;
  type: string;
  description: string;
  feedback: string;
  status: 'verde' | 'amarelo' | 'azul';
  calories: number;
  items: FoodItem[];
}

export interface ExerciseRecord {
  id: string;
  date: string;
  description: string;
  caloriesBurned: number;
}

export interface WeightLog {
  date: string;
  weight: number;
}
