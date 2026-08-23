// supabase/migrations/0001_new_schema.sql に対応する型定義。
// `supabase gen types typescript` を実行できる環境であれば、そちらで
// 生成したファイルに置き換えるのが望ましい（手書きのため乖離しうる）。

export type Garden = {
  id: string;
  member_code: string;
  name: string | null;
  created_at: string;
};

export type GardenMember = {
  id: string;
  garden_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export type Food = {
  id: number;
  garden_id: string | null;
  name: string;
  created_at: string;
};

export type FoodAlias = {
  id: number;
  food_id: number;
  alias: string;
};

export type CookingMethod = {
  id: number;
  food_id: number;
  garden_id: string | null;
  phase1: string | null;
  phase2: string | null;
  phase3: string | null;
  phase4: string | null;
  phase5: string | null;
  created_at: string;
  updated_at: string;
};

export type Child = {
  id: string;
  garden_id: string;
  name: string;
  age_month: number | null;
  created_at: string;
  updated_at: string;
};

export type ChildFoodRestriction = {
  id: string;
  child_id: string;
  food_id: number;
  cannot_eat: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Accident = {
  id: string;
  garden_id: string | null;
  child_id: string | null;
  food_id: number;
  food_name: string | null;
  content: string;
  is_public: boolean;
  created_at: string;
};

type Relationships = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      gardens: { Row: Garden; Insert: Partial<Garden>; Update: Partial<Garden> } & Relationships;
      garden_members: {
        Row: GardenMember;
        Insert: Partial<GardenMember>;
        Update: Partial<GardenMember>;
      } & Relationships;
      foods: { Row: Food; Insert: Partial<Food>; Update: Partial<Food> } & Relationships;
      food_aliases: {
        Row: FoodAlias;
        Insert: Partial<FoodAlias>;
        Update: Partial<FoodAlias>;
      } & Relationships;
      cooking_methods: {
        Row: CookingMethod;
        Insert: Partial<CookingMethod>;
        Update: Partial<CookingMethod>;
      } & Relationships;
      children: { Row: Child; Insert: Partial<Child>; Update: Partial<Child> } & Relationships;
      child_food_restrictions: {
        Row: ChildFoodRestriction;
        Insert: Partial<ChildFoodRestriction>;
        Update: Partial<ChildFoodRestriction>;
      } & Relationships;
      accidents: { Row: Accident; Insert: Partial<Accident>; Update: Partial<Accident> } & Relationships;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
