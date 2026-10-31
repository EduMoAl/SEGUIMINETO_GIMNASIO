// Rutina copiada de la pestaña "Rutina" de la hoja "Seguimiento entreno – PPL + torso".
// Los nombres deben coincidir EXACTAMENTE con los de la hoja (listas desplegables y pestaña Progreso).
// objetivos: rango de repeticiones de cada serie (una entrada por serie).
const RUTINA = {
  "Empuje": [
    {
      "nombre": "Press banca",
      "series": 3,
      "objetivos": [
        "6–8",
        "8–10",
        "8–10"
      ],
      "descanso": "3,5 min"
    },
    {
      "nombre": "Press militar",
      "series": 3,
      "objetivos": [
        "6–8",
        "8–10",
        "8–10"
      ],
      "descanso": "3 min"
    },
    {
      "nombre": "Fondos lastrados",
      "series": 2,
      "objetivos": [
        "6–10",
        "6–10"
      ],
      "descanso": "3 min"
    },
    {
      "nombre": "Contractora de pecho",
      "series": 3,
      "objetivos": [
        "10–15",
        "10–15",
        "10–15"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Press francés",
      "series": 2,
      "objetivos": [
        "8–12",
        "8–12"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Extensión de tríceps en polea cruzada",
      "series": 2,
      "objetivos": [
        "10–15",
        "10–15"
      ],
      "descanso": "1,5 min"
    }
  ],
  "Tirón": [
    {
      "nombre": "Remo en T",
      "series": 3,
      "objetivos": [
        "6–8",
        "8–10",
        "8–10"
      ],
      "descanso": "3 min"
    },
    {
      "nombre": "Jalón al pecho, agarre neutro",
      "series": 3,
      "objetivos": [
        "8–12",
        "8–12",
        "8–12"
      ],
      "descanso": "2,5 min"
    },
    {
      "nombre": "Remo en máquina",
      "series": 3,
      "objetivos": [
        "10–14",
        "10–14",
        "10–14"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Curl predicador",
      "series": 3,
      "objetivos": [
        "8–12",
        "8–12",
        "8–12"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Curl de bíceps en polea",
      "series": 2,
      "objetivos": [
        "12–20",
        "12–20"
      ],
      "descanso": "1,5 min"
    }
  ],
  "Pierna": [
    {
      "nombre": "Sentadilla hack",
      "series": 3,
      "objetivos": [
        "6–8",
        "8–10",
        "8–10"
      ],
      "descanso": "3,5 min"
    },
    {
      "nombre": "Aductora en máquina",
      "series": 2,
      "objetivos": [
        "10–15",
        "10–15"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Curl femoral sentado",
      "series": 3,
      "objetivos": [
        "8–12",
        "8–12",
        "8–12"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Peso muerto rumano",
      "series": 3,
      "objetivos": [
        "6–8",
        "8–10",
        "8–10"
      ],
      "descanso": "3,5 min"
    },
    {
      "nombre": "Hip thrust",
      "series": 2,
      "objetivos": [
        "8–12",
        "8–12"
      ],
      "descanso": "2,5 min"
    }
  ],
  "Fullbody": [
    {
      "nombre": "Extensión de rodilla",
      "series": 3,
      "objetivos": [
        "10–15",
        "10–15",
        "10–15"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Curl femoral tumbado",
      "series": 2,
      "objetivos": [
        "8–12",
        "8–12"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Press inclinado 45º",
      "series": 2,
      "objetivos": [
        "8–10",
        "8–10"
      ],
      "descanso": "3 min"
    },
    {
      "nombre": "Remo en polea",
      "series": 3,
      "objetivos": [
        "8–12",
        "8–12",
        "8–12"
      ],
      "descanso": "2,5 min"
    },
    {
      "nombre": "Elevaciones laterales en polea",
      "series": 3,
      "objetivos": [
        "12–15",
        "12–15",
        "12–15"
      ],
      "descanso": "1,5 min"
    },
    {
      "nombre": "Curl martillo con mancuernas",
      "series": 2,
      "objetivos": [
        "10–14",
        "10–14"
      ],
      "descanso": "2 min"
    },
    {
      "nombre": "Extensión de tríceps sobre la cabeza en polea",
      "series": 2,
      "objetivos": [
        "10–15",
        "10–15"
      ],
      "descanso": "2 min"
    }
  ]
};

// Orden de la rotación (para proponer el "siguiente entreno").
const ORDEN_SESIONES = ['Empuje', 'Tirón', 'Pierna', 'Fullbody'];

// Datos de presentación de cada sesión.
const INFO_SESION = {
  'Empuje':   { letra: 'E', grupos: 'Pecho · Hombro · Tríceps' },
  'Tirón':    { letra: 'T', grupos: 'Espalda · Bíceps' },
  'Pierna':   { letra: 'P', grupos: 'Cuádriceps · Femoral · Glúteo' },
  'Fullbody': { letra: 'F', grupos: 'Cuerpo completo' }
};

// Músculos de cada ejercicio: el primero es el principal (cuenta 1 serie),
// los demás son secundarios (cuentan ½). Igual que en apps-script/Code.gs.
const MUSCULOS = {
  'Press banca': ['Pecho', 'Hombro', 'Tríceps'],
  'Press inclinado 45º': ['Pecho', 'Hombro', 'Tríceps'],
  'Fondos lastrados': ['Pecho', 'Tríceps'],
  'Contractora de pecho': ['Pecho'],
  'Press militar': ['Hombro', 'Tríceps'],
  'Elevaciones laterales en polea': ['Hombro'],
  'Press francés': ['Tríceps'],
  'Extensión de tríceps en polea cruzada': ['Tríceps'],
  'Extensión de tríceps sobre la cabeza en polea': ['Tríceps'],
  'Remo en T': ['Espalda', 'Bíceps'],
  'Jalón al pecho, agarre neutro': ['Espalda', 'Bíceps'],
  'Remo en máquina': ['Espalda', 'Bíceps'],
  'Remo en polea': ['Espalda', 'Bíceps'],
  'Curl predicador': ['Bíceps'],
  'Curl de bíceps en polea': ['Bíceps'],
  'Curl martillo con mancuernas': ['Bíceps'],
  'Sentadilla hack': ['Cuádriceps', 'Glúteo'],
  'Extensión de rodilla': ['Cuádriceps'],
  'Curl femoral sentado': ['Femoral'],
  'Curl femoral tumbado': ['Femoral'],
  'Peso muerto rumano': ['Femoral', 'Glúteo'],
  'Hip thrust': ['Glúteo'],
  'Aductora en máquina': ['Aductores']
};
const ORDEN_MUSCULOS = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Femoral', 'Glúteo', 'Aductores'];
