
# Estratégia de Produto: NutriAmiga IA (MVP)

### 1. Regra de Decisão (Acesso)
*   **Identificação:** O app verifica a existência de um perfil local (`localStorage`) ou token de sessão no backend.
*   **Primeira vez:** O usuário é direcionado obrigatoriamente para o Fluxo de Onboarding (Boas-vindas + Coleta de dados).
*   **Usuário recorrente:** O app carrega diretamente a Tela Principal (Home) com o contexto do dia atual.

---

### 2. Fluxo de Primeiro Acesso (Onboarding)
1.  **Boas-vindas (Conexão):** Tela com frase curta: "Olá! Sou sua Nutri IA. Vou te ajudar a comer melhor sem complicações. Vamos começar?"
2.  **Perfil Bio (Dados):** Coleta de medidas básicas para cálculo metabólico.
3.  **Objetivo (Foco):** Usuário escolhe uma entre três opções simples (Emagrecer, Ganhar Saúde/Energia, Manter Peso).
4.  **Preferências/Restrições:** Seleção rápida de "o que você não come" (ex: carne, glúten, lactose) para evitar sugestões erradas da IA.
5.  **Finalização (Análise):** Animação curta da IA "montando seu plano" para gerar percepção de valor e personalização.

---

### 3. Ficha Inicial do Usuário (Campos Obrigatórios)
*   **Nome (Texto):** Para humanizar a conversa (Ex: "Bom dia, Maria!").
*   **Idade (Número):** Essencial para o cálculo de metabolismo basal.
*   **Sexo biológico (Seleção):** Necessário para precisão no cálculo nutricional.
*   **Peso e Altura (Número):** Para definição de IMC e metas calóricas.
*   **Nível de Atividade (Seleção):** (Sedentário, Moderado, Ativo) para ajustar o gasto calórico diário.

**O que NÃO pedir:** Telefone, endereço, exames laboratoriais detalhados ou histórico de doenças crônicas (isso gera abandono no MVP).

---

### 4. Tela Principal (Home) — MVP
*   **Cabeçalho Motivador:** Saudação personalizada com base no horário (Ex: "Quase hora do almoço, [Nome]!").
*   **Resumo do Dia (Card de Progresso):** Visualização simples de "Quanto você já comeu" vs "Quanto ainda pode comer" (energia).
*   **Próxima Refeição (Destaque Central):** Sugestão da IA do que comer em seguida baseada no seu objetivo e horário.
*   **Dica da Nutri (IA):** Uma frase curta e acionável sobre nutrição para educar o usuário sem sobrecarga.

---

### 5. Ações Principais (Botões Home)
1.  **Botão Central "Registrar Refeição":** Ação primária. Permite escrever o que comeu ou descrever por voz. A IA interpreta e calcula.
2.  **Botão "Falar com Nutri IA":** Abre chat para dúvidas rápidas (Ex: "Posso trocar arroz por batata?").
3.  **Botão "Ver Meu Plano":** Atalho para visualizar a estrutura da dieta sugerida.

---

### 6. Regras de Funcionamento no Dia 1
*   **Foco no Registro:** O objetivo do Dia 1 não é a perfeição, mas o hábito. O app incentiva o usuário a registrar qualquer coisa que comer.
*   **Sem Cobrança:** Se o usuário ultrapassar a meta no primeiro dia, a IA diz: "Tudo bem! Amanhã ajustamos. O importante é que você registrou!".
*   **Tour Guiado:** Na primeira vez que abrir a Home, um balão aponta para o botão de registro: "Sua única tarefa hoje é me contar o que você comeu aqui".
*   **Feedback Imediato:** Ao registrar a primeira refeição, a IA dá um elogio e uma curiosidade positiva sobre aquele alimento para gerar dopamina e retenção.
