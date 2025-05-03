// Socket.IO - Conexão global
let socket;

document.addEventListener('DOMContentLoaded', function() {
  // Inicializar Socket.IO
  socket = io();
  
  // Alertas com fechamento automático
  const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
  alerts.forEach(alert => {
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });
  
  // Tooltips
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  
  // Popovers
  const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
  const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl));
  
  // Confirmação para ações de exclusão
  document.querySelectorAll('.delete-confirm').forEach(button => {
    button.addEventListener('click', function(e) {
      if (!confirm('Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.')) {
        e.preventDefault();
        return false;
      }
    });
  });
  
  // Formatação de datas
  document.querySelectorAll('.format-date').forEach(element => {
    const timestamp = element.getAttribute('data-timestamp');
    if (timestamp) {
      const date = new Date(parseInt(timestamp));
      element.innerText = date.toLocaleString('pt-BR');
    }
  });
  
  // Ouvir eventos do Socket.IO
  socket.on('connect', () => {
    console.log('Conectado ao servidor via Socket.IO');
  });
  
  socket.on('disconnect', () => {
    console.log('Desconectado do servidor');
  });
  
  // Eventos de atualização de campanha
  socket.on('campanha:progresso', (data) => {
    updateCampanhaProgress(data);
  });
  
  socket.on('campanha:finalizada', (data) => {
    updateCampanhaProgress(data);
    
    // Notificar usuário
    if (Notification.permission === 'granted') {
      new Notification('Campanha Finalizada', {
        body: `Campanha #${data.campanhaId} finalizada. Enviados: ${data.enviados}, Erros: ${data.erros}`,
        icon: '/favicon.ico'
      });
    }
    
    // Mostrar toast se o elemento existir
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
      const toast = document.createElement('div');
      toast.classList.add('toast', 'show');
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.setAttribute('aria-atomic', 'true');
      
      toast.innerHTML = `
        <div class="toast-header">
          <strong class="me-auto">Campanha Finalizada</strong>
          <small>${new Date().toLocaleTimeString()}</small>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
          Campanha #${data.campanhaId} finalizada.<br>
          <strong>Enviados:</strong> ${data.enviados}<br>
          <strong>Erros:</strong> ${data.erros}<br>
          <strong>Status:</strong> ${data.status}
        </div>
      `;
      
      toastContainer.appendChild(toast);
      
      // Auto-close após 5 segundos
      setTimeout(() => {
        toast.remove();
      }, 5000);
    }
  });
  
  // Eventos de status do WhatsApp
  socket.on('whatsapp:status', (data) => {
    console.log('Status do WhatsApp atualizado:', data.status);
    
    // Atualizar indicador na navbar se existir
    const statusIndicator = document.getElementById('whatsapp-status-indicator');
    if (statusIndicator) {
      if (data.status === 'connected') {
        statusIndicator.classList.remove('bg-danger', 'bg-warning');
        statusIndicator.classList.add('bg-success');
        statusIndicator.setAttribute('title', 'WhatsApp Conectado');
      } else if (data.status === 'disconnected') {
        statusIndicator.classList.remove('bg-success', 'bg-warning');
        statusIndicator.classList.add('bg-danger');
        statusIndicator.setAttribute('title', 'WhatsApp Desconectado');
      } else {
        statusIndicator.classList.remove('bg-success', 'bg-danger');
        statusIndicator.classList.add('bg-warning');
        statusIndicator.setAttribute('title', `WhatsApp: ${data.status}`);
      }
    }
  });

  // Listener para mensagens recebidas
  socket.on('whatsapp:mensagem', async function(data) {
    if (data.from && data.text) {
      const respostaIA = await enviarMensagemParaIA(data.text, data.from);
      if (respostaIA) {
        processarRespostaIA(respostaIA);
      }
    }
  });

  // Listener para status da IA
  socket.on('whatsapp:ia_status', function(data) {
    atualizarStatusIA(data);
  });

  // Adicionar botão de toggle da IA se existir
  const toggleIAButton = document.getElementById('toggle-ia');
  if (toggleIAButton) {
    toggleIAButton.addEventListener('click', function() {
      const ativo = this.dataset.ativo === 'true';
      toggleIntegracaoIA(!ativo);
    });
  }

  // Listener para botão de teste
  const testButton = document.getElementById('test-ia');
  if (testButton) {
    testButton.addEventListener('click', testarWebhook);
  }

  // Verificar status inicial da IA
  verificarStatusIA();
});

// Função para atualizar o progresso de uma campanha
function updateCampanhaProgress(data) {
  const progressElement = document.getElementById(`campanha-progress-${data.campanhaId}`);
  if (!progressElement) return;
  
  const progressBar = progressElement.querySelector('.progress-bar');
  const enviados = parseInt(data.enviados);
  const total = parseInt(data.total);
  const percentual = Math.round((enviados / total) * 100);
  
  progressBar.style.width = `${percentual}%`;
  progressBar.setAttribute('aria-valuenow', percentual);
  progressBar.innerText = `${percentual}%`;
  
  const detailsElement = document.getElementById(`campanha-details-${data.campanhaId}`);
  if (detailsElement) {
    detailsElement.innerHTML = `
      <strong>Enviados:</strong> ${data.enviados} | 
      <strong>Erros:</strong> ${data.erros} | 
      <strong>Pendentes:</strong> ${data.pendentes} | 
      <strong>Total:</strong> ${data.total}
    `;
  }
}

// Função para formatar números de telefone
function formatarTelefone(numero) {
  if (!numero) return '';
  
  // Remover todos os caracteres não numéricos
  const nums = numero.replace(/\D/g, '');
  
  // Formatar conforme o padrão brasileiro
  if (nums.length === 11) {
    return `(${nums.substr(0, 2)}) ${nums.substr(2, 5)}-${nums.substr(7)}`;
  } else if (nums.length === 10) {
    return `(${nums.substr(0, 2)}) ${nums.substr(2, 4)}-${nums.substr(6)}`;
  } else if (nums.length === 13) { // Com código do país (+55)
    return `+${nums.substr(0, 2)} (${nums.substr(2, 2)}) ${nums.substr(4, 5)}-${nums.substr(9)}`;
  } else {
    return numero; // Retornar o número original se não conseguir formatar
  }
}

// Solicitar permissão para notificações
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('Este navegador não suporta notificações');
    return;
  }
  
  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('Permissão para notificações concedida');
      }
    });
  }
}

// Solicitar permissão ao carregar a página
requestNotificationPermission();

// Funções para integração com IA
async function enviarMensagemParaIA(mensagem, numero) {
  try {
    const response = await fetch('/api/whatsapp/ia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mensagem: mensagem,
        numero: numero
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Erro ao enviar mensagem para IA:', error);
    return null;
  }
}

function processarRespostaIA(resposta) {
  if (resposta && resposta.mensagem) {
    // Enviar a resposta de volta para o WhatsApp
    enviarMensagemWhatsApp(resposta.mensagem, resposta.numero);
  }
}

function atualizarStatusIA(status) {
  const statusElement = document.getElementById('ia-status');
  if (statusElement) {
    statusElement.innerHTML = `
      <div class="alert alert-${status.ativo ? 'success' : 'warning'}">
        <i class="bi bi-robot"></i>
        <strong>IA:</strong> ${status.ativo ? 'Ativa' : 'Inativa'}
        <small class="d-block">${status.mensagem}</small>
      </div>
    `;
  }
}

// Função para verificar status inicial da IA
async function verificarStatusIA() {
  try {
    const response = await fetch('/api/whatsapp/ia/status');
    const data = await response.json();
    
    // Atualizar UI
    atualizarStatusIA(data);
    
    // Atualizar botão
    const toggleButton = document.getElementById('toggle-ia');
    if (toggleButton) {
      toggleButton.dataset.ativo = data.ativo;
      toggleButton.innerHTML = `
        <i class="bi bi-power"></i> ${data.ativo ? 'Desativar IA' : 'Ativar IA'}
      `;
      toggleButton.classList.toggle('btn-outline-primary', !data.ativo);
      toggleButton.classList.toggle('btn-primary', data.ativo);
    }
  } catch (error) {
    console.error('Erro ao verificar status da IA:', error);
  }
}

// Atualizar função toggleIntegracaoIA
async function toggleIntegracaoIA(ativo) {
  try {
    const response = await fetch('/api/whatsapp/ia/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ativo })
    });
    
    const data = await response.json();
    
    // Atualizar UI
    atualizarStatusIA(data);
    
    // Atualizar botão
    const toggleButton = document.getElementById('toggle-ia');
    if (toggleButton) {
      toggleButton.dataset.ativo = ativo;
      toggleButton.innerHTML = `
        <i class="bi bi-power"></i> ${ativo ? 'Desativar IA' : 'Ativar IA'}
      `;
      toggleButton.classList.toggle('btn-outline-primary', !ativo);
      toggleButton.classList.toggle('btn-primary', ativo);
    }

    // Mostrar toast
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
      const toast = document.createElement('div');
      toast.classList.add('toast', 'show');
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.setAttribute('aria-atomic', 'true');
      
      toast.innerHTML = `
        <div class="toast-header">
          <strong class="me-auto">Status da IA</strong>
          <small>${new Date().toLocaleTimeString()}</small>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
          ${data.mensagem}
        </div>
      `;
      
      toastContainer.appendChild(toast);
      
      // Auto-close após 5 segundos
      setTimeout(() => {
        toast.remove();
      }, 5000);
    }
  } catch (error) {
    console.error('Erro ao alterar status da IA:', error);
  }
}

// Função para testar webhook
async function testarWebhook() {
  try {
    const response = await fetch('/api/whatsapp/ia', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mensagem: "Olá, esta é uma mensagem de teste!",
        numero: "5511999999999"
      })
    });
    
    const data = await response.json();
    console.log('Resposta do webhook:', data);
    
    // Mostrar toast com resultado
    const toastContainer = document.getElementById('toast-container');
    if (toastContainer) {
      const toast = document.createElement('div');
      toast.classList.add('toast', 'show');
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.setAttribute('aria-atomic', 'true');
      
      toast.innerHTML = `
        <div class="toast-header">
          <strong class="me-auto">Teste de Webhook</strong>
          <small>${new Date().toLocaleTimeString()}</small>
          <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
          <strong>Status:</strong> ${data.success ? 'Sucesso' : 'Erro'}<br>
          <strong>Resposta:</strong> ${JSON.stringify(data)}
        </div>
      `;
      
      toastContainer.appendChild(toast);
      
      // Auto-close após 5 segundos
      setTimeout(() => {
        toast.remove();
      }, 5000);
    }
  } catch (error) {
    console.error('Erro ao testar webhook:', error);
    alert('Erro ao testar webhook. Verifique o console para mais detalhes.');
  }
} 