const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

// Inicializar Groq con la API Key del entorno
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = function(db) {

  // Middleware para asegurar que el usuario esté autenticado
  router.use((req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    next();
  });

  router.post('/', async (req, res) => {
    try {
      const { message, history } = req.body;
      const userId = req.session.userId;
      
      if (!message) {
        return res.status(400).json({ error: 'Mensaje vacío' });
      }

      // Obtener el contexto del usuario (cuentas y saldos)
      const accounts = db.prepare('SELECT id, initial_balance, name, currency FROM accounts WHERE user_id = ?').all(userId);
      let totalBalance = 0;
      let accountDetails = '';
      
      accounts.forEach(acc => {
        const inc = db.prepare("SELECT SUM(amount) as t FROM transactions WHERE account_id = ? AND type = 'income'").get(acc.id);
        const exp = db.prepare("SELECT SUM(amount) as t FROM transactions WHERE account_id = ? AND type = 'expense'").get(acc.id);
        const tin = db.prepare("SELECT SUM(amount) as t FROM transactions WHERE to_account_id = ? AND type = 'transfer'").get(acc.id);
        const tout = db.prepare("SELECT SUM(amount) as t FROM transactions WHERE account_id = ? AND type = 'transfer'").get(acc.id);

        const balance = acc.initial_balance + (inc.t || 0) - (exp.t || 0) + (tin.t || 0) - (tout.t || 0);
        totalBalance += balance;
        accountDetails += `- ${acc.name}: €${balance.toFixed(2)}\n`;
      });

      // Obtener transacciones recientes
      const recentTx = db.prepare(`
        SELECT type, amount, description, date 
        FROM transactions 
        WHERE user_id = ? 
        ORDER BY date DESC LIMIT 10
      `).all(userId);

      let txDetails = recentTx.map(t => {
        const typeStr = t.type === 'expense' ? 'Gasto' : t.type === 'income' ? 'Ingreso' : 'Transferencia';
        const sign = t.type === 'expense' ? '-' : '+';
        return `${t.date} | ${typeStr} | ${t.description || 'Sin descripción'} | ${sign}€${t.amount.toFixed(2)}`;
      }).join('\n');

      if (!txDetails) txDetails = 'No hay transacciones recientes.';

      // Construir el System Prompt
      const systemPrompt = `Eres "Taitou AI", el asistente financiero de ${req.session.userName}.

Contexto financiero actual:
Saldo total estimado: €${totalBalance.toFixed(2)}
Cuentas:
${accountDetails || 'Sin cuentas'}

Últimos movimientos:
${txDetails}

REGLAS ESTRICTAS:
1. SÉ EXTREMADAMENTE DIRECTO Y CONCISO. Prohibido dar largas introducciones o despedidas (nada de "¡Hola! Como tu asistente...", "Espero haberte ayudado", etc.). Ve directo al grano en la primera frase.
2. DA RECOMENDACIONES PROACTIVAS. Si ves gastos altos, transacciones sospechosas o poco saldo, adviértelo directamente y dale un consejo claro y corto.
3. Responde siempre en frases cortas, listas o viñetas (bullet points).
4. No inventes transacciones. Usa SÓLO los datos proporcionados.
5. Usa tono directo, profesional y ligeramente asertivo.`;

      // Preparar los mensajes para Groq
      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      // Añadir historial previo si existe
      if (history && Array.isArray(history)) {
        messages.push(...history);
      }

      // Añadir el mensaje actual
      messages.push({ role: 'user', content: message });

      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 500,
      });

      const reply = chatCompletion.choices[0]?.message?.content || "Lo siento, no pude procesar eso.";

      res.json({ success: true, reply: reply });

    } catch (err) {
      console.error("Error en chat API:", err);
      // Proveer un mensaje útil si falta la API key
      if (err.message && err.message.includes('API key')) {
         return res.status(500).json({ error: 'La API Key de Groq no está configurada correctamente en el servidor.' });
      }
      res.status(500).json({ error: 'Hubo un error al conectar con la IA.' });
    }
  });

  return router;
};
