// Training programs by level. Each item: [exerciseId, sets, reps, restSeconds]
// Exercise ids come from free-exercise-db.
window.PROGRAMS = [
  // ---------------- BEGINNER ----------------
  {
    id: 'bw-basics', level: 'beginner', name: { en: 'Bodyweight Basics', es: 'Peso corporal básico' }, perWeek: 3, weeks: 6,
    goal: { en: 'No equipment', es: 'Sin equipo' }, desc: { en: 'Build the habit and the movement patterns anywhere — home, park or hotel room.', es: 'Crea el hábito y los patrones de movimiento en cualquier lugar — casa, parque u hotel.' },
    days: [
      { name: { en: 'Full Body A', es: 'Cuerpo completo A' }, items: [
        ['Bodyweight_Squat', 3, '12-15', 60], ['Incline_Push-Up', 3, '8-12', 60],
        ['Single_Leg_Glute_Bridge', 3, '10/leg', 45], ['Bodyweight_Walking_Lunge', 2, '10/leg', 60],
        ['Plank', 3, '30s', 45], ['Mountain_Climbers', 3, '20', 45] ] },
      { name: { en: 'Full Body B', es: 'Cuerpo completo B' }, items: [
        ['Split_Squats', 3, '8/leg', 60], ['Pushups', 3, 'AMRAP', 60],
        ['Bench_Dips', 3, '8-12', 60], ['Crunches', 3, '15', 45],
        ['Push_Up_to_Side_Plank', 2, '6/side', 45] ] },
    ],
  },
  {
    id: 'foundation', level: 'beginner', name: { en: 'Foundation Full Body', es: 'Base cuerpo completo' }, perWeek: 3, weeks: 8,
    goal: { en: 'Strength + technique', es: 'Fuerza + técnica' }, desc: { en: 'Alternate A and B three times a week. Add weight every session you hit all reps — linear progression is the beginner superpower.', es: 'Alterna A y B tres veces por semana. Sube peso cada sesión en que completes todas las reps — la progresión lineal es el superpoder del principiante.' },
    days: [
      { name: { en: 'Workout A', es: 'Entreno A' }, items: [
        ['Barbell_Squat', 3, '5', 150], ['Barbell_Bench_Press_-_Medium_Grip', 3, '5', 150],
        ['Bent_Over_Barbell_Row', 3, '8', 120], ['Plank', 3, '45s', 60] ] },
      { name: { en: 'Workout B', es: 'Entreno B' }, items: [
        ['Barbell_Squat', 3, '5', 150], ['Standing_Military_Press', 3, '5', 150],
        ['Barbell_Deadlift', 1, '5', 180], ['Wide-Grip_Lat_Pulldown', 3, '10', 90],
        ['Crunches', 3, '15', 45] ] },
    ],
  },
  {
    id: 'machine-starter', level: 'beginner', name: { en: 'Machine Starter', es: 'Inicio en máquinas' }, perWeek: 3, weeks: 6,
    goal: { en: 'Confidence in the gym', es: 'Confianza en el gym' }, desc: { en: 'Guided machines and cables — safe, simple, effective for the first months.', es: 'Máquinas guiadas y poleas — seguro, simple y efectivo para los primeros meses.' },
    days: [
      { name: { en: 'Full Body', es: 'Cuerpo completo' }, items: [
        ['Leg_Press', 3, '10-12', 90], ['Machine_Shoulder_Military_Press', 3, '10-12', 90],
        ['Seated_Cable_Rows', 3, '10-12', 90], ['Butterfly', 3, '12', 60],
        ['Lying_Leg_Curls', 3, '12', 60], ['Triceps_Pushdown', 2, '12-15', 60],
        ['Cable_Crunch', 3, '15', 45] ] },
    ],
  },

  // ---------------- INTERMEDIATE ----------------
  {
    id: 'upper-lower', level: 'intermediate', name: { en: 'Upper / Lower', es: 'Torso / Pierna' }, perWeek: 4, weeks: 10,
    goal: { en: 'Strength + size', es: 'Fuerza + tamaño' }, desc: { en: 'Each muscle twice a week. Heavy compound first, then accessories in the 8–12 range.', es: 'Cada músculo dos veces por semana. Primero el compuesto pesado, luego accesorios en el rango de 8–12.' },
    days: [
      { name: { en: 'Upper (Heavy)', es: 'Tren superior (pesado)' }, items: [
        ['Barbell_Bench_Press_-_Medium_Grip', 4, '5', 180], ['Bent_Over_Barbell_Row', 4, '6', 150],
        ['Dumbbell_Shoulder_Press', 3, '8', 120], ['Pullups', 3, 'AMRAP', 120],
        ['EZ-Bar_Skullcrusher', 3, '10', 75], ['Barbell_Curl', 3, '10', 75] ] },
      { name: { en: 'Lower (Heavy)', es: 'Tren inferior (pesado)' }, items: [
        ['Barbell_Squat', 4, '5', 180], ['Romanian_Deadlift', 3, '8', 150],
        ['Leg_Press', 3, '10', 120], ['Seated_Leg_Curl', 3, '12', 75],
        ['Standing_Calf_Raises', 4, '12', 60], ['Hanging_Leg_Raise', 3, '10', 60] ] },
      { name: { en: 'Upper (Volume)', es: 'Tren superior (volumen)' }, items: [
        ['Barbell_Incline_Bench_Press_-_Medium_Grip', 4, '8-10', 120], ['Seated_Cable_Rows', 4, '10', 90],
        ['Side_Lateral_Raise', 4, '12-15', 60], ['Wide-Grip_Lat_Pulldown', 3, '10-12', 90],
        ['Triceps_Pushdown_-_Rope_Attachment', 3, '12', 60], ['Hammer_Curls', 3, '12', 60] ] },
      { name: { en: 'Lower (Volume)', es: 'Tren inferior (volumen)' }, items: [
        ['Barbell_Deadlift', 3, '5', 180], ['Front_Squat_Clean_Grip', 3, '8', 150],
        ['Dumbbell_Lunges', 3, '10/leg', 90], ['Leg_Extensions', 3, '12-15', 60],
        ['Barbell_Hip_Thrust', 3, '10', 90], ['Cable_Crunch', 3, '15', 45] ] },
    ],
  },
  {
    id: 'ppl-3', level: 'intermediate', name: { en: 'Push · Pull · Legs', es: 'Empuje · Tirón · Pierna' }, perWeek: 3, weeks: 8,
    goal: { en: 'Hypertrophy', es: 'Hipertrofia' }, desc: { en: 'The classic split, once per week each. Run it twice through for 6 days when you have time.', es: 'La rutina dividida clásica, una vez por semana cada día. Hazla dos veces (6 días) cuando tengas tiempo.' },
    days: [
      { name: { en: 'Push', es: 'Empuje' }, items: [
        ['Barbell_Bench_Press_-_Medium_Grip', 4, '6-8', 150], ['Incline_Dumbbell_Press', 3, '8-10', 120],
        ['Standing_Military_Press', 3, '8', 120], ['Side_Lateral_Raise', 4, '12-15', 60],
        ['Dips_-_Triceps_Version', 3, 'AMRAP', 90], ['Triceps_Pushdown', 3, '12', 60] ] },
      { name: { en: 'Pull', es: 'Tirón' }, items: [
        ['Barbell_Deadlift', 3, '5', 180], ['Pullups', 4, '6-10', 120],
        ['Bent_Over_Barbell_Row', 3, '8', 120], ['Face_Pull', 3, '15', 60],
        ['Barbell_Curl', 3, '10', 75], ['Hammer_Curls', 2, '12', 60] ] },
      { name: { en: 'Legs', es: 'Pierna' }, items: [
        ['Barbell_Squat', 4, '6-8', 180], ['Romanian_Deadlift', 3, '8-10', 150],
        ['Leg_Press', 3, '12', 120], ['Lying_Leg_Curls', 3, '12', 75],
        ['Standing_Calf_Raises', 4, '15', 60], ['Plank', 3, '60s', 45] ] },
    ],
  },
  {
    id: 'kb-conditioning', level: 'intermediate', name: { en: 'Kettlebell Engine', es: 'Motor con pesa rusa' }, perWeek: 3, weeks: 6,
    goal: { en: 'Conditioning', es: 'Acondicionamiento' }, desc: { en: 'Strength-endurance circuits. Move briskly between exercises, rest at the end of each round.', es: 'Circuitos de fuerza-resistencia. Pasa rápido entre ejercicios y descansa al final de cada ronda.' },
    days: [
      { name: { en: 'Circuit', es: 'Circuito' }, items: [
        ['One-Arm_Kettlebell_Swings', 5, '15', 30], ['Goblet_Squat', 5, '10', 30],
        ['Two-Arm_Kettlebell_Military_Press', 5, '8', 30], ['Alternating_Kettlebell_Row', 5, '10', 30],
        ['Farmers_Walk', 3, '40m', 60], ['Battling_Ropes', 3, '30s', 60] ] },
    ],
  },

  // ---------------- EXPERT ----------------
  {
    id: 'ppl-6', level: 'expert', name: { en: 'PPL × 2 (6-day)', es: 'PPL × 2 (6 días)' }, perWeek: 6, weeks: 12,
    goal: { en: 'Max hypertrophy', es: 'Hipertrofia máxima' }, desc: { en: 'High frequency, high volume. Day 1–3 heavy, day 4–6 pump. Deload every 5th week.', es: 'Alta frecuencia, alto volumen. Días 1–3 pesados, días 4–6 de bombeo. Descarga cada 5ª semana.' },
    days: [
      { name: { en: 'Push (Heavy)', es: 'Empuje (pesado)' }, items: [
        ['Bench_Press_-_Powerlifting', 5, '3-5', 210], ['Barbell_Shoulder_Press', 4, '5', 180],
        ['Weighted_Bench_Dip', 3, '6-8', 120], ['Incline_Cable_Flye', 3, '12', 60],
        ['Side_Lateral_Raise', 5, '15', 45], ['EZ-Bar_Skullcrusher', 3, '8', 90] ] },
      { name: { en: 'Pull (Heavy)', es: 'Tirón (pesado)' }, items: [
        ['Barbell_Deadlift', 5, '3', 240], ['Pullups', 5, '5 (weighted)', 150],
        ['T-Bar_Row_with_Handle', 4, '6-8', 120], ['Face_Pull', 4, '15', 60],
        ['Barbell_Shrug', 3, '10', 75], ['Barbell_Curl', 4, '8', 75] ] },
      { name: { en: 'Legs (Heavy)', es: 'Pierna (pesado)' }, items: [
        ['Barbell_Full_Squat', 5, '3-5', 240], ['Romanian_Deadlift', 4, '6', 180],
        ['Barbell_Walking_Lunge', 3, '10/leg', 120], ['Seated_Leg_Curl', 4, '10', 75],
        ['Standing_Calf_Raises', 5, '10', 60], ['Hanging_Leg_Raise', 4, '12', 60] ] },
      { name: { en: 'Push (Pump)', es: 'Empuje (bombeo)' }, items: [
        ['Incline_Dumbbell_Press', 4, '10-12', 90], ['Arnold_Dumbbell_Press', 4, '10', 90],
        ['Dumbbell_Flyes', 3, '15', 60], ['Cable_Seated_Lateral_Raise', 4, '15', 45],
        ['Triceps_Pushdown_-_Rope_Attachment', 4, '15', 45], ['Cable_Rope_Overhead_Triceps_Extension', 3, '15', 45] ] },
      { name: { en: 'Pull (Pump)', es: 'Tirón (bombeo)' }, items: [
        ['Wide-Grip_Lat_Pulldown', 4, '10-12', 90], ['Seated_Cable_Rows', 4, '12', 90],
        ['Cable_Rear_Delt_Fly', 4, '15', 45], ['Rope_Straight-Arm_Pulldown', 3, '15', 45],
        ['Alternate_Incline_Dumbbell_Curl', 3, '12', 60], ['Cable_Hammer_Curls_-_Rope_Attachment', 3, '15', 45] ] },
      { name: { en: 'Legs (Pump)', es: 'Pierna (bombeo)' }, items: [
        ['Front_Squat_Clean_Grip', 4, '8', 150], ['Leg_Press', 4, '15', 90],
        ['Barbell_Hip_Thrust', 4, '12', 90], ['Leg_Extensions', 4, '15', 60],
        ['Lying_Leg_Curls', 4, '15', 60], ['Calf_Press_On_The_Leg_Press_Machine', 4, '20', 45] ] },
    ],
  },
  {
    id: 'powerbuilding', level: 'expert', name: { en: 'Powerbuilding 4-day', es: 'Powerbuilding 4 días' }, perWeek: 4, weeks: 12,
    goal: { en: 'Big 3 strength', es: 'Fuerza en los 3 grandes' }, desc: { en: 'Top-set triples on the competition lifts, then bodybuilding work. Track your e1RM — it is the scoreboard.', es: 'Triples pesados en los levantamientos de competencia y luego trabajo de culturismo. Sigue tu 1RM estimado — es tu marcador.' },
    days: [
      { name: { en: 'Squat Day', es: 'Día de sentadilla' }, items: [
        ['Barbell_Squat', 5, '3', 240], ['Box_Squat', 3, '5', 180],
        ['Romanian_Deadlift', 3, '8', 150], ['Leg_Extensions', 3, '12', 60], ['Plank', 3, '60s', 45] ] },
      { name: { en: 'Bench Day', es: 'Día de banca' }, items: [
        ['Bench_Press_-_Powerlifting', 5, '3', 240], ['Close-Grip_Barbell_Bench_Press', 3, '6', 150],
        ['Bent_Over_Barbell_Row', 4, '8', 120], ['Side_Lateral_Raise', 4, '15', 45],
        ['EZ-Bar_Skullcrusher', 3, '10', 75] ] },
      { name: { en: 'Deadlift Day', es: 'Día de peso muerto' }, items: [
        ['Barbell_Deadlift', 5, '2-3', 270], ['Deficit_Deadlift', 3, '5', 180],
        ['Pullups', 4, '8', 120], ['Barbell_Hip_Thrust', 3, '10', 90], ['Hanging_Leg_Raise', 3, '12', 60] ] },
      { name: { en: 'Press + Arms', es: 'Press + brazos' }, items: [
        ['Standing_Military_Press', 5, '3-5', 210], ['Incline_Dumbbell_Press', 3, '10', 90],
        ['Face_Pull', 4, '15', 60], ['Barbell_Curl', 4, '10', 60], ['Dips_-_Triceps_Version', 3, 'AMRAP', 90] ] },
    ],
  },
  {
    id: 'olympic', level: 'expert', name: { en: 'Athletic Power', es: 'Potencia atlética' }, perWeek: 3, weeks: 8,
    goal: { en: 'Explosiveness', es: 'Explosividad' }, desc: { en: 'Olympic-lift derivatives + strength. Keep reps crisp; stop sets when bar speed drops.', es: 'Derivados olímpicos + fuerza. Reps explosivas; corta la serie cuando baje la velocidad de la barra.' },
    days: [
      { name: { en: 'Power A', es: 'Potencia A' }, items: [
        ['Power_Clean', 5, '3', 180], ['Front_Squat_Clean_Grip', 4, '4', 180],
        ['Pullups', 4, '6', 120], ['Box_Jump_Multiple_Response', 4, '5', 90] ] },
      { name: { en: 'Power B', es: 'Potencia B' }, items: [
        ['Power_Clean_from_Blocks', 5, '2', 180], ['Overhead_Squat', 4, '5', 150],
        ['Barbell_Deadlift', 3, '3', 210], ['Rope_Jumping', 3, '60s', 60] ] },
    ],
  },
];

// Achievements: test(stats) -> boolean
window.BADGES = [
  { id: 'first', icon: 'target', name: { en: 'First Rep', es: 'Primera rep' }, desc: { en: 'Finish your first workout', es: 'Termina tu primer entreno' }, test: s => s.workouts >= 1 },
  { id: 'ten', icon: 'medal', name: { en: 'Committed', es: 'Comprometido' }, desc: { en: 'Finish 10 workouts', es: 'Termina 10 entrenos' }, test: s => s.workouts >= 10 },
  { id: 'fifty', icon: 'award', name: { en: 'Regular', es: 'Habitual' }, desc: { en: 'Finish 50 workouts', es: 'Termina 50 entrenos' }, test: s => s.workouts >= 50 },
  { id: 'hundred', icon: 'gem', name: { en: 'Centurion', es: 'Centurión' }, desc: { en: 'Finish 100 workouts', es: 'Termina 100 entrenos' }, test: s => s.workouts >= 100 },
  { id: 'pr1', icon: 'trophy', name: { en: 'Record Breaker', es: 'Rompe récords' }, desc: { en: 'Set your first PR', es: 'Logra tu primer récord' }, test: s => s.prs >= 1 },
  { id: 'pr25', icon: 'crown', name: { en: 'PR Machine', es: 'Máquina de récords' }, desc: { en: 'Set 25 PRs', es: 'Logra 25 récords' }, test: s => s.prs >= 25 },
  { id: 'ton', icon: 'dumbbell', name: { en: 'Ten Tonnes', es: 'Diez toneladas' }, desc: { en: 'Lift 10,000 kg total volume', es: 'Levanta 10.000 kg de volumen total' }, test: s => s.volume >= 10000 },
  { id: 'hundredton', icon: 'building', name: { en: 'Skyscraper', es: 'Rascacielos' }, desc: { en: 'Lift 100,000 kg total volume', es: 'Levanta 100.000 kg de volumen total' }, test: s => s.volume >= 100000 },
  { id: 'streak3', icon: 'flame', name: { en: 'On Fire', es: 'En llamas' }, desc: { en: '3-week training streak', es: 'Racha de 3 semanas entrenando' }, test: s => s.weekStreak >= 3 },
  { id: 'streak8', icon: 'zap', name: { en: 'Unstoppable', es: 'Imparable' }, desc: { en: '8-week training streak', es: 'Racha de 8 semanas entrenando' }, test: s => s.weekStreak >= 8 },
  { id: 'variety', icon: 'compass', name: { en: 'Explorer', es: 'Explorador' }, desc: { en: 'Train 25 different exercises', es: 'Entrena 25 ejercicios distintos' }, test: s => s.distinct >= 25 },
  { id: 'bw', icon: 'scale', name: { en: 'Bodyweight Club', es: 'Club del Peso Corporal' }, desc: { en: 'Lift your bodyweight on any exercise', es: 'Levanta tu peso corporal en cualquier ejercicio' }, test: s => s.bwClub },
  { id: 'early', icon: 'sunrise', name: { en: 'Early Bird', es: 'Madrugador' }, desc: { en: 'Start a workout before 7am', es: 'Empieza un entreno antes de las 7 a. m.' }, test: s => s.early },
  { id: 'night', icon: 'moon', name: { en: 'Night Owl', es: 'Búho nocturno' }, desc: { en: 'Start a workout after 9pm', es: 'Empieza un entreno después de las 9 p. m.' }, test: s => s.night },
];

// Athlete ranks unlocked with XP
window.RANKS = [
  { xp: 0, name: { en: 'Rookie', es: 'Novato' }, icon: 'sprout' },
  { xp: 500, name: { en: 'Novice', es: 'Aprendiz' }, icon: 'star' },
  { xp: 1500, name: { en: 'Apprentice', es: 'Constante' }, icon: 'medal' },
  { xp: 3500, name: { en: 'Athlete', es: 'Atleta' }, icon: 'award' },
  { xp: 7000, name: { en: 'Iron Warrior', es: 'Guerrero de hierro' }, icon: 'shield' },
  { xp: 12000, name: { en: 'Titan', es: 'Titán' }, icon: 'mountain' },
  { xp: 20000, name: { en: 'Legend', es: 'Leyenda' }, icon: 'crown' },
];
