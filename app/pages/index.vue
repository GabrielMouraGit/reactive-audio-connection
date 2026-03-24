<template>
  <div class="home">
    <div class="header">
      <h1>🎙️ Reactive Audio Connection</h1>
      <p>WebRTC + WebSocket Signaling</p>
    </div>

    <div class="cards">
      <div class="card">
        <div class="card-icon">🎙️</div>
        <h2>Áudio + Chat</h2>
        <p>Comunicação por voz com indicador visual de fala</p>
        <NuxtLink to="/audio" class="btn">Ir para Áudio</NuxtLink>
      </div>

      <div class="card">
        <div class="card-icon">📹</div>
        <h2>Vídeo + Áudio</h2>
        <p>Chamada de vídeo completa com controle de câmera</p>
        <NuxtLink to="/video" class="btn">Ir para Vídeo</NuxtLink>
      </div>
    </div>

    <section class="info">
      <h3>ℹ️ Como usar</h3>
      <ol>
        <li>Abra dois navegadores (ou duas abas) com esta aplicação</li>
        <li>Escolha o mesmo nome de sala em ambos</li>
        <li>Clique em "Entrar na Sala"</li>
        <li>A conexão WebRTC será estabelecida automaticamente</li>
        <li>Permita acesso a câmera/microfone quando solicitado</li>
      </ol>

      <h3>🔧 Requisitos técnicos</h3>
      <ul>
        <li>Navegador moderno com suporte a WebRTC</li>
        <li>Servidor de sinalização ativo (localhost:3005)</li>
        <li>Permissão para usar câmera/microfone</li>
      </ul>
    </section>
  </div>
</template>

<script setup>
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.home {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header {
  text-align: center;
  color: white;
  margin-bottom: 50px;
}

.header h1 {
  font-size: 48px;
  margin: 0 0 10px 0;
  font-weight: 700;
}

.header p {
  font-size: 20px;
  margin: 0;
  opacity: 0.9;
}

.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 50px;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 40px 30px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
}

.card-icon {
  font-size: 60px;
  margin-bottom: 20px;
}

.card h2 {
  color: #333;
  margin: 0 0 15px 0;
  font-size: 24px;
}

.card p {
  color: #666;
  margin: 0 0 25px 0;
  line-height: 1.6;
}

.btn {
  display: inline-block;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 30px;
  border-radius: 6px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 14px;
}

.btn:hover {
  transform: scale(1.05);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.info {
  background: white;
  border-radius: 12px;
  padding: 40px;
  color: #333;
}

.info h3 {
  color: #667eea;
  margin-top: 0;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.info ol,
.info ul {
  line-height: 1.8;
  color: #555;
}

.info li {
  margin-bottom: 12px;
}

/* Responsivo */
@media (max-width: 768px) {
  .home {
    padding: 20px;
  }

  .header h1 {
    font-size: 32px;
  }

  .header p {
    font-size: 16px;
  }

  .cards {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .card {
    padding: 30px 20px;
  }

  .card-icon {
    font-size: 48px;
  }

  .card h2 {
    font-size: 20px;
  }

  .info {
    padding: 20px;
  }
}
</style>
