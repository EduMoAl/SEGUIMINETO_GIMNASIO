'use strict';
/* Rutina de las pruebas en el formato de la pestaña Rutina:
 * Sesión · Orden · Ejercicio · Series · Repeticiones · Descanso · Músculo principal · Secundarios · Material */
const RUTINA_PRUEBA = [
  ["Empuje",1,"Press banca",3,"6–8 / 8–10 / 8–10","3,5 min","Pecho","Hombro, Tríceps","Barra"],
  ["Empuje",2,"Press militar",3,"6–8 / 8–10 / 8–10","3 min","Hombro","Tríceps","Barra"],
  ["Empuje",3,"Fondos lastrados",2,"6–10 / 6–10","3 min","Pecho","Tríceps","Peso corporal"],
  ["Empuje",4,"Contractora de pecho",3,"10–15 / 10–15 / 10–15","2 min","Pecho","","Máquina"],
  ["Empuje",5,"Press francés",2,"8–12 / 8–12","2 min","Tríceps","","Otro"],
  ["Empuje",6,"Extensión de tríceps en polea cruzada",2,"10–15 / 10–15","1,5 min","Tríceps","","Polea"],
  ["Tirón",1,"Remo en T",3,"6–8 / 8–10 / 8–10","3 min","Espalda","Bíceps","Máquina"],
  ["Tirón",2,"Jalón al pecho, agarre neutro",3,"8–12 / 8–12 / 8–12","2,5 min","Espalda","Bíceps","Polea"],
  ["Tirón",3,"Remo en máquina",3,"10–14 / 10–14 / 10–14","2 min","Espalda","Bíceps","Máquina"],
  ["Tirón",4,"Curl predicador",3,"8–12 / 8–12 / 8–12","2 min","Bíceps","","Polea"],
  ["Tirón",5,"Curl de bíceps en polea",2,"12–20 / 12–20","1,5 min","Bíceps","","Polea"],
  ["Pierna",1,"Sentadilla hack",3,"6–8 / 8–10 / 8–10","3,5 min","Cuádriceps","Glúteo","Máquina"],
  ["Pierna",2,"Aductora en máquina",2,"10–15 / 10–15","2 min","Aductores","","Máquina"],
  ["Pierna",3,"Curl femoral sentado",3,"8–12 / 8–12 / 8–12","2 min","Femoral","","Máquina"],
  ["Pierna",4,"Peso muerto rumano",3,"6–8 / 8–10 / 8–10","3,5 min","Femoral","Glúteo, Lumbar","Barra"],
  ["Pierna",5,"Hip thrust",2,"8–12 / 8–12","2,5 min","Glúteo","","Barra"],
  ["Fullbody",1,"Extensión de rodilla",3,"10–15 / 10–15 / 10–15","2 min","Cuádriceps","","Máquina"],
  ["Fullbody",2,"Curl femoral tumbado",2,"8–12 / 8–12","2 min","Femoral","","Máquina"],
  ["Fullbody",3,"Press inclinado 45º",2,"8–10 / 8–10","3 min","Pecho","Hombro, Tríceps","Barra"],
  ["Fullbody",4,"Remo en polea",3,"8–12 / 8–12 / 8–12","2,5 min","Espalda","Bíceps","Polea"],
  ["Fullbody",5,"Elevaciones laterales en polea",3,"12–15 / 12–15 / 12–15","1,5 min","Hombro","","Polea"],
  ["Fullbody",6,"Curl martillo con mancuernas",2,"10–14 / 10–14","2 min","Bíceps","Antebrazo","Mancuernas"],
  ["Fullbody",7,"Extensión de tríceps sobre la cabeza en polea",2,"10–15 / 10–15","2 min","Tríceps","","Polea"]
];

module.exports = { RUTINA_PRUEBA };
