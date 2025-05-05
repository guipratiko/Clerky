const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const Campanha = require('../models/Campanha');
const Config = require('../models/Config');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Variáveis para armazenar o cliente e seu estado
let whatsappClient = null;
let clientState = 'disconnected';
let qrCodeData = null;
let socketIO = null;

// Configurações do cliente WhatsApp
const clientConfig = {
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
};

// URLs padrão do webhook
const DEFAULT_WEBHOOK_URLS = {
  test: 'https://guipratiko.app.n8n.cloud/webhook-test/28e86e9d-faba-4eff-94b8-d9d710acfe79',
  prod: 'https://guipratiko.app.n8n.cloud/webhook/28e86e9d-faba-4eff-94b8-d9d710acfe79'
};

// Função para obter as URLs do webhook
async function getWebhookUrls() {
  try {
    const [testConfig, prodConfig] = await Promise.all([
      Config.findOne({ chave: 'webhook_url_test' }),
      Config.findOne({ chave: 'webhook_url_prod' })
    ]);

    return {
      test: testConfig ? testConfig.valor : DEFAULT_WEBHOOK_URLS.test,
      prod: prodConfig ? prodConfig.valor : DEFAULT_WEBHOOK_URLS.prod
    };
  } catch (error) {
    console.error('Erro ao obter URLs do webhook:', error);
    return DEFAULT_WEBHOOK_URLS;
  }
}

// Função para salvar as URLs do webhook
async function saveWebhookUrls(testUrl, prodUrl) {
  try {
    await Promise.all([
      Config.findOneAndUpdate(
        { chave: 'webhook_url_test' },
        { valor: testUrl, atualizadoEm: new Date() },
        { upsert: true, new: true }
      ),
      Config.findOneAndUpdate(
        { chave: 'webhook_url_prod' },
        { valor: prodUrl, atualizadoEm: new Date() },
        { upsert: true, new: true }
      )
    ]);
    return true;
  } catch (error) {
    console.error('Erro ao salvar URLs do webhook:', error);
    return false;
  }
}

// Função para obter a URL atual do webhook
async function getWebhookUrl() {
  const Config = require('../models/Config');
  const config = await Config.findOne({ chave: 'webhook_url' });
  return config ? config.valor : DEFAULT_WEBHOOK_URLS.test;
}

// Função para inicializar o cliente WhatsApp
function init(io) {
  try {
    socketIO = io;
    
    // Se já existe um cliente, destruí-lo antes de criar um novo
    if (whatsappClient) {
      whatsappClient.destroy();
      whatsappClient = null;
      clientState = 'disconnected';
      qrCodeData = null;
    }
    
    // Limpar a pasta de cache antes de inicializar
    const cachePath = path.join(process.cwd(), '.wwebjs_cache');
    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath, { recursive: true, force: true });
    }
    
    console.log('Inicializando cliente WhatsApp...');
    
    whatsappClient = new Client(clientConfig);
    
    // Evento de QR Code
    whatsappClient.on('qr', (qr) => {
      console.log('QR Code recebido');
      qrCodeData = qr;
      clientState = 'qr';
      
      // Enviar o QR Code para o frontend via Socket.IO
      if (socketIO) {
        qrcode.toDataURL(qr, (err, url) => {
          if (err) {
            console.error('Erro ao gerar QR Code:', err);
            return;
          }
          socketIO.emit('whatsapp:qr', { url });
        });
      }
    });
    
    // Evento de autenticação
    whatsappClient.on('authenticated', () => {
      console.log('Cliente autenticado');
      clientState = 'authenticated';
      qrCodeData = null;
      
      if (socketIO) {
        socketIO.emit('whatsapp:status', { status: 'authenticated' });
      }
    });
    
    // Evento de inicialização
    whatsappClient.on('ready', () => {
      console.log('Cliente pronto');
      clientState = 'connected';
      
      if (socketIO) {
        socketIO.emit('whatsapp:status', { status: 'connected' });
      }
    });
    
    // Evento de desconexão
    whatsappClient.on('disconnected', (reason) => {
      console.log('Cliente desconectado:', reason);
      clientState = 'disconnected';
      whatsappClient = null;
      
      if (socketIO) {
        socketIO.emit('whatsapp:status', { status: 'disconnected', reason });
      }
    });

    // Evento de mensagem recebida
    whatsappClient.on('message', async (message) => {
      console.log('📩 Nova mensagem recebida:', message.body);
      
      try {
        // Verificar se IA está ativa
        const Config = require('../models/Config');
        const config = await Config.findOne({ chave: 'ia_ativa' });
        
        if (!config || !config.valor) {
          console.log('❌ IA está desativada - mensagem ignorada');
          return;
        }

        // Obter informações do contato
        const contact = await message.getContact();
        
        // Preparar dados para enviar ao n8n
        let webhookData = {
          nomeCliente: contact.name || contact.pushname || 'Desconhecido',
          telefoneCliente: message.from.replace('@c.us', ''),
          mensagem: null,
          idMensagem: message.id.id,
          'mensagem-audio': null
        };

        // Verificar o tipo de mensagem
        if (message.hasMedia) {
          console.log('📦 Mensagem contém mídia, tipo:', message.type);
          const media = await message.downloadMedia();
          console.log('📥 Mídia baixada:', {
            type: media.mimetype,
            hasData: !!media.data,
            dataLength: media.data ? media.data.length : 0
          });
          
          if (media) {
            if (message.type === 'audio' || message.type === 'ptt') {
              console.log('🎵 Processando mensagem de áudio');
              webhookData['mensagem-audio'] = media.data;
              console.log('✅ Áudio em base64:', media.data.substring(0, 50) + '...');
            } else if (message.type === 'image') {
              webhookData.mensagem = media.data;
              console.log('🖼️ Mensagem de imagem recebida');
            } else if (message.type === 'video') {
              webhookData.mensagem = media.data;
              console.log('🎥 Mensagem de vídeo recebida');
            } else if (message.type === 'document') {
              webhookData.mensagem = media.data;
              console.log('📄 Mensagem de documento recebida');
            }
          } else {
            console.log('❌ Mídia não foi baixada corretamente');
          }
        } else {
          // Mensagem de texto
          webhookData.mensagem = message.body;
          console.log('📝 Mensagem de texto recebida');
        }

        console.log('🤖 Enviando mensagem para n8n:', JSON.stringify(webhookData, null, 2));

        // Enviar para o n8n usando a URL correta
        const webhookUrl = await getWebhookUrl();
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(webhookData)
        });

        const data = await response.json();
        console.log('📤 Resposta do n8n:', data);

        // Emitir evento via Socket.IO
        if (socketIO) {
          socketIO.emit('whatsapp:mensagem_recebida', {
            numero: message.from,
            mensagem: message.body || 'Mídia recebida',
            tipo: message.type,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
      }
    });
    
    // Iniciar o cliente
    whatsappClient.initialize();
    
  } catch (err) {
    console.error('Erro ao inicializar cliente WhatsApp:', err);
    clientState = 'error';
    
    if (socketIO) {
      socketIO.emit('whatsapp:status', { status: 'error', message: err.message });
    }
  }
}

// Função para obter o status do cliente
function getStatus(req, res) {
  res.json({
    state: clientState,
    hasQR: qrCodeData !== null
  });
}

// Função para obter o QR Code
async function getQRCode(req, res) {
  if (!qrCodeData) {
    return res.status(404).json({ msg: 'QR Code não disponível' });
  }
  
  try {
    const qrDataURL = await qrcode.toDataURL(qrCodeData);
    res.json({ qrcode: qrDataURL });
  } catch (err) {
    console.error('Erro ao gerar QR Code:', err);
    res.status(500).json({ msg: 'Erro ao gerar QR Code' });
  }
}

// Função para renderizar a página do WhatsApp
function renderWhatsApp(req, res) {
  res.render('whatsapp', {
    title: 'Conexão WhatsApp',
    messages: req.flash()
  });
}

// Função para verificar número no WhatsApp
async function verificarNumeroWhatsApp(telefone) {
  try {
    if (!whatsappClient || clientState !== 'connected') {
      throw new Error('Cliente WhatsApp não está conectado');
    }
    
    // Limpar o número - remover caracteres não numéricos
    let numeroLimpo = telefone.replace(/\D/g, '');
    
    // Verificar formato do número
    console.log('Número original:', numeroLimpo);
    
    // Se o número começa com 0, remover
    if (numeroLimpo.startsWith('0')) {
      numeroLimpo = numeroLimpo.substring(1);
    }
    
    // Se o número não tem código do país (Brasil), adicionar 55
    if (!numeroLimpo.startsWith('55') && numeroLimpo.length <= 11) {
      numeroLimpo = '55' + numeroLimpo;
    }
    
    // Verificar se é um número brasileiro (começa com 55)
    if (numeroLimpo.startsWith('55')) {
      // Verificar se tem DDD (2 dígitos após o 55)
      if (numeroLimpo.length < 12) {
        throw new Error('Número brasileiro inválido - DDD ausente');
      }
      
      const ddd = numeroLimpo.substring(2, 4);
      const numeroBase = numeroLimpo.substring(4);
      
      // Se for DDD 11, 12, 17, 18 ou 19, adicionar o nono dígito antes da sequência de 8 dígitos
      if (ddd === '11' || ddd === '12' || ddd === '17' || ddd === '18' || ddd === '19') {
        const numeroComNono = `55${ddd}9${numeroBase}`;
        console.log(`Tentando validar número com nono dígito (DDD ${ddd}):`, numeroComNono);
        
        try {
          const numeroWhatsAppComNono = `${numeroComNono}@c.us`;
          const numeroInfoComNono = await Promise.race([
            whatsappClient.isRegisteredUser(numeroWhatsAppComNono),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout na verificação do número')), 10000)
            )
          ]);
          
          if (numeroInfoComNono) {
            return await obterInfoContato(numeroComNono, numeroWhatsAppComNono);
          }
        } catch (err) {
          console.log(`Número com nono dígito não válido: ${err.message}`);
        }
        
        return {
          numero: numeroLimpo,
          existe: false,
          numeroWhatsApp: `${numeroLimpo}@c.us`
        };
      }
      
      // Para outros DDDs, manter o comportamento atual
      const numeroSemNono = numeroLimpo;
      const numeroComNono = `55${ddd}9${numeroBase}`;
      
      console.log('Tentando validar número sem nono dígito:', numeroSemNono);
      console.log('Tentando validar número com nono dígito:', numeroComNono);
      
      let resultadoSemNono = null;
      let resultadoComNono = null;
      
      // Tentar validar com o número original
      try {
        const numeroWhatsAppOriginal = `${numeroSemNono}@c.us`;
        const numeroInfoOriginal = await Promise.race([
          whatsappClient.isRegisteredUser(numeroWhatsAppOriginal),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout na verificação do número')), 10000)
          )
        ]);
        
        if (numeroInfoOriginal) {
          resultadoSemNono = await obterInfoContato(numeroSemNono, numeroWhatsAppOriginal);
          console.log('Número sem nono dígito é válido');
        }
      } catch (err) {
        console.log(`Número sem nono dígito não válido: ${err.message}`);
      }
      
      // Tentar validar com nono dígito
      try {
        const numeroWhatsAppComNono = `${numeroComNono}@c.us`;
        const numeroInfoComNono = await Promise.race([
          whatsappClient.isRegisteredUser(numeroWhatsAppComNono),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout na verificação do número')), 10000)
          )
        ]);
        
        if (numeroInfoComNono) {
          resultadoComNono = await obterInfoContato(numeroComNono, numeroWhatsAppComNono);
          console.log('Número com nono dígito é válido');
        }
      } catch (err) {
        console.log(`Número com nono dígito não válido: ${err.message}`);
      }
      
      // Decidir qual resultado retornar
      if (resultadoSemNono && resultadoComNono) {
        // Se ambos funcionaram, preferir o que tem mais informações
        if (resultadoSemNono.nome && !resultadoComNono.nome) {
          console.log('Retornando resultado sem nono dígito (mais informações)');
          return resultadoSemNono;
        } else if (resultadoComNono.nome && !resultadoSemNono.nome) {
          console.log('Retornando resultado com nono dígito (mais informações)');
          return resultadoComNono;
        } else {
          // Se ambos têm as mesmas informações, preferir o formato original
          console.log('Retornando resultado sem nono dígito (formato original)');
          return resultadoSemNono;
        }
      } else if (resultadoSemNono) {
        console.log('Retornando resultado sem nono dígito');
        return resultadoSemNono;
      } else if (resultadoComNono) {
        console.log('Retornando resultado com nono dígito');
        return resultadoComNono;
      } else {
        console.log('Nenhum formato funcionou');
        return {
          numero: numeroLimpo,
          existe: false,
          numeroWhatsApp: `${numeroLimpo}@c.us`
        };
      }
    }
    
    // Para números não brasileiros, validar normalmente
    const numeroWhatsApp = `${numeroLimpo}@c.us`;
    const numeroInfo = await Promise.race([
      whatsappClient.isRegisteredUser(numeroWhatsApp),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na verificação do número')), 10000)
      )
    ]);
    
    if (numeroInfo) {
      return await obterInfoContato(numeroLimpo, numeroWhatsApp);
    } else {
      return {
        numero: numeroLimpo,
        existe: false,
        numeroWhatsApp: numeroWhatsApp
      };
    }
  } catch (err) {
    console.error(`Erro ao verificar número ${telefone}:`, err);
    throw err;
  }
}

// Função auxiliar para obter informações do contato
const obterInfoContato = async (numeroLimpo, numeroWhatsApp) => {
  try {
    const contato = await whatsappClient.getContactById(numeroWhatsApp);
    if (contato) {
      return {
        nome: contato.name || contato.pushname || '',
        status: contato.status || '',
        numero: numeroLimpo,
        existe: true,
        numeroWhatsApp: numeroWhatsApp
      };
    }
  } catch (infoErr) {
    console.error(`Erro ao obter informações do contato ${numeroLimpo}:`, infoErr);
  }
  
  return {
    numero: numeroLimpo,
    existe: true,
    numeroWhatsApp: numeroWhatsApp
  };
};

// Função para processar campanha
async function processarCampanha(req, res) {
  const { id } = req.params;
  const { velocidadeDisparo } = req.body;
  
  try {
    // Verificar se o cliente WhatsApp está conectado
    if (!whatsappClient || clientState !== 'connected') {
      req.flash('error', 'Cliente WhatsApp não está conectado. Conecte-se primeiro.');
      return res.redirect('/whatsapp');
    }
    
    // Verificar se a campanha existe
    const campanha = await Campanha.findById(id).populate('template');
    
    if (!campanha) {
      req.flash('error', 'Campanha não encontrada');
      return res.redirect('/campanhas');
    }
    
    // Verificar se a campanha tem contatos
    if (!campanha.listaContatos || !campanha.listaContatos.contatos || campanha.listaContatos.contatos.length === 0) {
      req.flash('error', 'A campanha não possui contatos para envio');
      return res.redirect(`/campanhas/${id}`);
    }
    
    // Verificar se a campanha já está em processamento
    if (campanha.status === 'processando') {
      req.flash('error', 'A campanha já está em processamento');
      return res.redirect(`/campanhas/${id}`);
    }
    
    // Definir o intervalo de tempo com base na velocidade selecionada
    let intervaloMin, intervaloMax;
    switch (velocidadeDisparo) {
      case 'media':
        intervaloMin = 55000; // 55 segundos
        intervaloMax = 65000; // 65 segundos
        break;
      case 'rapida':
        intervaloMin = 500; // 0.5 segundos
        intervaloMax = 1000; // 1 segundo
        break;
      case 'lenta':
      default:
        intervaloMin = 110000; // 110 segundos
        intervaloMax = 135000; // 135 segundos
        break;
    }
    
    // Atualizar status da campanha
    campanha.status = 'processando';
    campanha.dataInicio = campanha.dataInicio || Date.now();
    campanha.intervaloDisparo = { min: intervaloMin, max: intervaloMax };
    await campanha.save();
    
    // Iniciar processamento em background
    processarEnvio(campanha);
    
    req.flash('success', 'Processamento da campanha iniciado');
    res.redirect(`/campanhas/${id}`);
    
  } catch (err) {
    console.error('Erro ao processar campanha:', err);
    req.flash('error', `Erro ao processar campanha: ${err.message}`);
    res.redirect('/campanhas');
  }
}

// Função para pausar campanha
async function pausarCampanha(req, res) {
  const { id } = req.params;
  
  try {
    const campanha = await Campanha.findById(id);
    
    if (!campanha) {
      req.flash('error', 'Campanha não encontrada');
      return res.redirect('/campanhas');
    }
    
    if (campanha.status !== 'processando') {
      req.flash('error', 'A campanha não está em processamento');
      return res.redirect(`/campanhas/${id}`);
    }
    
    campanha.status = 'pausada';
    await campanha.save();
    
    req.flash('success', 'Campanha pausada com sucesso');
    res.redirect(`/campanhas/${id}`);
    
  } catch (err) {
    console.error('Erro ao pausar campanha:', err);
    req.flash('error', `Erro ao pausar campanha: ${err.message}`);
    res.redirect('/campanhas');
  }
}

// Função para cancelar campanha
async function cancelarCampanha(req, res) {
  const { id } = req.params;
  
  try {
    const campanha = await Campanha.findById(id);
    
    if (!campanha) {
      req.flash('error', 'Campanha não encontrada');
      return res.redirect('/campanhas');
    }
    
    // Permitir cancelar em qualquer status, exceto se já estiver cancelada ou concluída
    if (campanha.status === 'cancelada' || campanha.status === 'concluida') {
      req.flash('error', 'A campanha já está finalizada');
      return res.redirect(`/campanhas/${id}`);
    }
    
    campanha.status = 'cancelada';
    await campanha.save();
    
    req.flash('success', 'Campanha cancelada com sucesso');
    res.redirect(`/campanhas/${id}`);
    
  } catch (err) {
    console.error('Erro ao cancelar campanha:', err);
    req.flash('error', `Erro ao cancelar campanha: ${err.message}`);
    res.redirect('/campanhas');
  }
}

// Função para desconectar
async function desconectar(req, res) {
  try {
    // Limpar a pasta de cache antes de desconectar
    const cachePath = path.join(process.cwd(), '.wwebjs_cache');
    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath, { recursive: true, force: true });
    }

    if (whatsappClient) {
      await whatsappClient.logout();
      whatsappClient = null;
      clientState = 'disconnected';
      qrCodeData = null;
    }
    
    // Reinicializar o cliente após a desconexão
    if (socketIO) {
      init(socketIO);
    }
    
    req.flash('success', 'WhatsApp desconectado com sucesso');
    res.redirect('/whatsapp');
    
  } catch (err) {
    console.error('Erro ao desconectar WhatsApp:', err);
    req.flash('error', `Erro ao desconectar: ${err.message}`);
    res.redirect('/whatsapp');
  }
}

// Função para processar o envio de mensagens
const processarEnvio = async (campanha) => {
  try {
    console.log(`Iniciando processamento da campanha: ${campanha._id} - ${campanha.nome}`);
    
    const template = campanha.template;
    const contatos = campanha.listaContatos.contatos;
    let enviados = 0;
    let erros = 0;
    let contagemEnvios = 0;
    
    // Limitar a 100 mensagens por vez
    const contatosPendentes = contatos.filter(c => c.status === 'pendente');
    const contatosParaProcessar = contatosPendentes.slice(0, 100);
    
    console.log(`Processando ${contatosParaProcessar.length} contatos pendentes de ${contatosPendentes.length} total`);
    
    // Iterar pelos contatos pendentes (limitado a 100)
    for (const contato of contatosParaProcessar) {
      // Verificar se o WhatsApp ainda está conectado
      if (!whatsappClient || clientState !== 'connected') {
        console.error('Cliente WhatsApp desconectado durante o processamento da campanha');
        throw new Error('Cliente WhatsApp desconectado');
      }
      
      // Verificar se a campanha ainda está em processamento
      const campanhaAtualizada = await Campanha.findById(campanha._id);
      if (!campanhaAtualizada || campanhaAtualizada.status !== 'processando') {
        console.log('Processamento interrompido - campanha pausada, cancelada ou excluída');
        break;
      }
      
      // Processar apenas contatos pendentes
      if (contato.status === 'pendente') {
        try {
          console.log(`Processando contato: ${contato.numero}`);
          
          // Verificar se o número existe no WhatsApp com timeout de segurança
          let numeroInfo;
          try {
            const verificacaoPromise = verificarNumeroWhatsApp(contato.numero);
            numeroInfo = await Promise.race([
              verificacaoPromise,
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout na verificação do número')), 15000)
              )
            ]);
          } catch (verificacaoErr) {
            console.error(`Timeout ou erro na verificação do número ${contato.numero}:`, verificacaoErr);
            contato.status = 'erro';
            contato.mensagemErro = `Erro na verificação: ${verificacaoErr.message}`;
            erros++;
            continue;
          }
          
          if (!numeroInfo.existe) {
            console.log(`Número não existe no WhatsApp: ${contato.numero}`);
            contato.status = 'erro';
            contato.mensagemErro = 'Número não encontrado no WhatsApp';
            erros++;
            continue;
          }
          
          // Usar o número validado com @c.us
          const numeroValidado = numeroInfo.numeroWhatsApp;
          
          // Registrar informações do contato (se disponíveis)
          if (numeroInfo.info) {
            console.log(`Enviando para: ${numeroValidado} | Nome: ${numeroInfo.info.nome || 'N/A'} | Status: ${numeroInfo.info.status || 'N/A'}`);
          } else {
            console.log(`Enviando para: ${numeroValidado}`);
          }
          
          // Verificar o tipo de template e enviar conforme o tipo com timeout de segurança
          try {
            let envioPromise;
            
            console.log('Template:', JSON.stringify(template, null, 2));
            
            if (template.tipo === 'texto') {
              // Enviar mensagem de texto
              envioPromise = whatsappClient.sendMessage(numeroValidado, template.conteudo.texto);
            } else if (template.tipo === 'imagem') {
              // Verificar se existem arquivos
              if (!template.conteudo.arquivos || template.conteudo.arquivos.length === 0) {
                console.log('Template sem arquivos:', template);
                throw new Error('Template de imagem não possui arquivos');
              }
              
              // Enviar imagem (apenas a primeira)
              const arquivo = template.conteudo.arquivos[0];
              if (!arquivo) {
                console.log('Arquivo não encontrado no template:', template);
                throw new Error('Nenhum arquivo encontrado no template');
              }
              
              // Extrair apenas o nome do arquivo
              let nomeArquivo = arquivo.caminhoArquivo;
              
              // Se for um caminho absoluto, extrair só o nome do arquivo
              if (nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
                nomeArquivo = path.basename(nomeArquivo);
              }
              
              // Construir caminho do arquivo usando apenas o nome
              const caminhoArquivo = path.join(__dirname, '..', 'uploads', nomeArquivo);
              console.log('Caminho do arquivo (corrigido):', caminhoArquivo);
              
              // Verificar se o arquivo existe
              if (!fs.existsSync(caminhoArquivo)) {
                console.log('Arquivo não existe no caminho principal, tentando caminho alternativo...');
                
                // Tentar buscar em uploads com caminho completo
                const caminhoAlternativo = path.join(__dirname, '..', 'uploads', path.basename(arquivo.caminhoArquivo));
                console.log('Tentando caminho alternativo:', caminhoAlternativo);
                
                if (!fs.existsSync(caminhoAlternativo)) {
                  console.log('Arquivo não encontrado em nenhum caminho possível');
                  throw new Error(`Arquivo de imagem não encontrado. Verifique se o arquivo existe em ${caminhoArquivo}`);
                }
                
                // Usar o caminho alternativo que foi encontrado
                const media = MessageMedia.fromFilePath(caminhoAlternativo);
                envioPromise = whatsappClient.sendMessage(numeroValidado, media, {
                  caption: template.conteudo.texto || ''
                });
              } else {
                // Usar o caminho encontrado
                const media = MessageMedia.fromFilePath(caminhoArquivo);
                envioPromise = whatsappClient.sendMessage(numeroValidado, media, {
                  caption: template.conteudo.texto || ''
                });
              }
            } else if (template.tipo === 'audio') {
              // Verificar se existem arquivos
              if (!template.conteudo.arquivos || template.conteudo.arquivos.length === 0) {
                throw new Error('Template de áudio não possui arquivos');
              }
              
              // Enviar áudio (apenas o primeiro)
              const arquivo = template.conteudo.arquivos[0];
              if (!arquivo) {
                throw new Error('Nenhum arquivo encontrado no template');
              }
              
              // Extrair apenas o nome do arquivo
              let nomeArquivo = arquivo.caminhoArquivo;
              
              // Se for um caminho absoluto, extrair só o nome do arquivo
              if (nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
                nomeArquivo = path.basename(nomeArquivo);
              }
              
              // Construir caminho do arquivo usando apenas o nome
              const caminhoArquivo = path.join(__dirname, '..', 'uploads', nomeArquivo);
              console.log('Caminho do arquivo de áudio:', caminhoArquivo);
              
              // Verificar se o arquivo existe
              if (!fs.existsSync(caminhoArquivo)) {
                console.log('Arquivo de áudio não existe no caminho principal, tentando caminho alternativo...');
                
                // Tentar buscar em uploads com caminho completo
                const caminhoAlternativo = path.join(__dirname, '..', 'uploads', path.basename(arquivo.caminhoArquivo));
                
                if (!fs.existsSync(caminhoAlternativo)) {
                  throw new Error(`Arquivo de áudio não encontrado. Verifique se o arquivo existe em ${caminhoArquivo}`);
                }
                
                // Usar o caminho alternativo
                const media = MessageMedia.fromFilePath(caminhoAlternativo);
                
                // Verificar se é para enviar como mensagem de voz
                if (template.conteudo.tipoAudio === 'voz') {
                  envioPromise = whatsappClient.sendMessage(numeroValidado, media, { sendAudioAsVoice: true });
                } else {
                  envioPromise = whatsappClient.sendMessage(numeroValidado, media);
                }
              } else {
                // Usar o caminho encontrado
                const media = MessageMedia.fromFilePath(caminhoArquivo);
                
                // Verificar se é para enviar como mensagem de voz
                if (template.conteudo.tipoAudio === 'voz') {
                  envioPromise = whatsappClient.sendMessage(numeroValidado, media, { sendAudioAsVoice: true });
                } else {
                  envioPromise = whatsappClient.sendMessage(numeroValidado, media);
                }
              }
            } else if (template.tipo === 'arquivo') {
              // Verificar se existem arquivos
              if (!template.conteudo.arquivos || template.conteudo.arquivos.length === 0) {
                throw new Error('Template de arquivo não possui arquivos');
              }
              
              // Enviar arquivo (apenas o primeiro)
              const arquivo = template.conteudo.arquivos[0];
              if (!arquivo) {
                throw new Error('Nenhum arquivo encontrado no template');
              }
              
              // Extrair apenas o nome do arquivo
              let nomeArquivo = arquivo.caminhoArquivo;
              
              // Se for um caminho absoluto, extrair só o nome do arquivo
              if (nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
                nomeArquivo = path.basename(nomeArquivo);
              }
              
              // Construir caminho do arquivo usando apenas o nome
              const caminhoArquivo = path.join(__dirname, '..', 'uploads', nomeArquivo);
              console.log('Caminho do arquivo:', caminhoArquivo);
              
              // Verificar se o arquivo existe
              if (!fs.existsSync(caminhoArquivo)) {
                console.log('Arquivo não existe no caminho principal, tentando caminho alternativo...');
                
                // Tentar buscar em uploads com caminho completo
                const caminhoAlternativo = path.join(__dirname, '..', 'uploads', path.basename(arquivo.caminhoArquivo));
                
                if (!fs.existsSync(caminhoAlternativo)) {
                  throw new Error(`Arquivo não encontrado. Verifique se o arquivo existe em ${caminhoArquivo}`);
                }
                
                // Usar o caminho alternativo
                const media = MessageMedia.fromFilePath(caminhoAlternativo);
                envioPromise = whatsappClient.sendMessage(numeroValidado, media);
              } else {
                // Usar o caminho encontrado
                const media = MessageMedia.fromFilePath(caminhoArquivo);
                envioPromise = whatsappClient.sendMessage(numeroValidado, media);
              }
            } else if (template.tipo === 'misto' && template.conteudo.arquivos && template.conteudo.arquivos.length > 0) {
              // Enviar mensagem de texto primeiro
              if (template.conteudo.texto) {
                await Promise.race([
                  whatsappClient.sendMessage(numeroValidado, template.conteudo.texto),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout no envio de texto')), 20000)
                  )
                ]);
                
                // Pequena pausa entre mensagens
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
              
              // Enviar apenas o primeiro arquivo para evitar problemas
              const arquivo = template.conteudo.arquivos[0];
              if (arquivo) {
                // Extrair apenas o nome do arquivo
                let nomeArquivo = arquivo.caminhoArquivo;
                
                // Se for um caminho absoluto, extrair só o nome do arquivo
                if (nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
                  nomeArquivo = path.basename(nomeArquivo);
                }
                
                // Construir caminho do arquivo usando apenas o nome
                const caminhoArquivo = path.join(__dirname, '..', 'uploads', nomeArquivo);
                console.log('Caminho do arquivo (misto):', caminhoArquivo);
                
                // Verificar se o arquivo existe
                if (!fs.existsSync(caminhoArquivo)) {
                  console.log('Arquivo não existe no caminho principal, tentando caminho alternativo...');
                  
                  // Tentar buscar em uploads com caminho completo
                  const caminhoAlternativo = path.join(__dirname, '..', 'uploads', path.basename(arquivo.caminhoArquivo));
                  
                  if (!fs.existsSync(caminhoAlternativo)) {
                    throw new Error(`Arquivo não encontrado. Verifique se o arquivo existe em ${caminhoArquivo}`);
                  }
                  
                  // Usar o caminho alternativo
                  const media = MessageMedia.fromFilePath(caminhoAlternativo);
                  envioPromise = whatsappClient.sendMessage(numeroValidado, media);
                } else {
                  // Usar o caminho encontrado
                  const media = MessageMedia.fromFilePath(caminhoArquivo);
                  envioPromise = whatsappClient.sendMessage(numeroValidado, media);
                }
              } else {
                throw new Error('Arquivo não encontrado');
              }
            } else {
              throw new Error(`Tipo de template inválido ou não suportado: ${template.tipo}`);
            }
            
            // Aguardar envio com timeout
            if (envioPromise) {
              await Promise.race([
                envioPromise,
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Timeout no envio da mensagem')), 30000)
                )
              ]);
            }
            
            // Atualizar status do contato
            contato.status = 'enviado';
            contato.dataEnvio = Date.now();
            
            // Armazenar informações do contato, se disponíveis
            if (numeroInfo.info) {
              contato.infoContato = {
                nome: numeroInfo.info.nome || '',
                status: numeroInfo.info.status || ''
              };
            }
            
            enviados++;
            contagemEnvios++;
            
            console.log(`Mensagem enviada com sucesso para: ${numeroValidado}`);
            
            // Pausa entre envios usando o intervalo definido na campanha
            const tempoEspera = Math.floor(Math.random() * (campanha.intervaloDisparo.max - campanha.intervaloDisparo.min)) + campanha.intervaloDisparo.min;
            console.log(`Aguardando ${Math.round(tempoEspera/1000)} segundos antes do próximo envio...`);
            await new Promise(resolve => setTimeout(resolve, tempoEspera));
            
            // A cada 10 envios, fazer uma pausa de 10 minutos
            if (contagemEnvios % 10 === 0) {
              console.log(`Pausa de segurança de 10 minutos após ${contagemEnvios} envios`);
              await new Promise(resolve => setTimeout(resolve, 600000)); // 10 minutos
            }
            
          } catch (envioErr) {
            console.error(`Erro no envio para ${numeroValidado}:`, envioErr);
            contato.status = 'erro';
            contato.mensagemErro = `Erro no envio: ${envioErr.message}`;
            erros++;
          }
          
        } catch (err) {
          console.error(`Erro ao processar contato ${contato.numero}:`, err);
          contato.status = 'erro';
          contato.mensagemErro = err.message;
          erros++;
        }
      }
      
      // Salvar campanha periodicamente para atualizar o progresso
      try {
        // Atualizar apenas esse contato específico na base de dados
        await Campanha.updateOne(
          { _id: campanha._id, "listaContatos.contatos._id": contato._id },
          { 
            $set: { 
              "listaContatos.contatos.$.status": contato.status,
              "listaContatos.contatos.$.dataEnvio": contato.dataEnvio,
              "listaContatos.contatos.$.mensagemErro": contato.mensagemErro,
              "listaContatos.contatos.$.infoContato": contato.infoContato
            } 
          }
        );
        
        // Emitir atualização via Socket.IO
        if (socketIO) {
          const campanhaAtualizada = await Campanha.findById(campanha._id)
            .populate('template');
            
          socketIO.emit('campanha:progresso', {
            campanhaId: campanha._id,
            enviados: campanhaAtualizada.estatisticas.enviados,
            erros: campanhaAtualizada.estatisticas.erros,
            pendentes: campanhaAtualizada.estatisticas.pendentes,
            total: campanhaAtualizada.estatisticas.total
          });
        }
      } catch (updateErr) {
        console.error('Erro ao atualizar contato na campanha:', updateErr);
      }
    }
    
    // Finalizar a campanha
    try {
      // Recalcular estatísticas
      const campanhaFinal = await Campanha.findById(campanha._id);
      
      if (!campanhaFinal) {
        console.error('Campanha não encontrada ao finalizar processamento');
        return;
      }
      
      const contatosRestantes = campanhaFinal.listaContatos.contatos.filter(c => c.status === 'pendente');
      const contatosProcessados = campanhaFinal.listaContatos.contatos.filter(c => c.status !== 'pendente');
      
      // Se não houver mais contatos pendentes, marcar como concluída
      if (contatosRestantes.length === 0) {
        campanhaFinal.status = 'concluida';
        campanhaFinal.dataConclusao = Date.now();
        console.log(`Campanha ${campanhaFinal._id} concluída com sucesso!`);
      } else {
        // Se ainda houver contatos pendentes, mas atingimos o limite de 100 ou houve algum erro, pausar
        campanhaFinal.status = 'pausada';
        console.log(`Campanha ${campanhaFinal._id} pausada com ${contatosRestantes.length} contatos pendentes`);
      }
      
      // Salvar a campanha com o novo status
      await campanhaFinal.save();
      
      console.log(`Processamento finalizado: ${enviados} enviados, ${erros} erros, ${contatosRestantes.length} pendentes`);
      
      // Emitir atualização final via Socket.IO
      if (socketIO) {
        // Emitir evento de atualização geral
        socketIO.emit('atualizacaoCampanha', {
          campanhaId: campanhaFinal._id.toString(),
          status: campanhaFinal.status
        });
        
        // Emitir evento específico de finalização
        socketIO.emit('campanha:finalizada', {
          campanhaId: campanhaFinal._id.toString(),
          status: campanhaFinal.status,
          enviados: contatosProcessados.filter(c => c.status === 'enviado').length,
          erros: contatosProcessados.filter(c => c.status === 'erro').length,
          pendentes: contatosRestantes.length
        });
        
        console.log('Eventos de notificação Socket.IO enviados');
      }
    } catch (finalizacaoErr) {
      console.error('Erro ao finalizar campanha:', finalizacaoErr);
      
      // Tentar atualizar o status mesmo em caso de erro
      try {
        await Campanha.findByIdAndUpdate(campanha._id, { 
          status: 'pausada',
          $set: { 'campanhaErro': finalizacaoErr.message }
        });
      } catch (err) {
        console.error('Erro ao atualizar status após falha:', err);
      }
    }
  } catch (err) {
    console.error('Erro no processamento da campanha:', err);
    
    // Atualizar status da campanha para pausada em caso de erro
    try {
      await Campanha.findByIdAndUpdate(campanha._id, { status: 'pausada' });
    } catch (updateErr) {
      console.error('Erro ao atualizar status da campanha após erro:', updateErr);
    }
  }
};

// Exportar o módulo
module.exports = {
  init,
  getStatus,
  getQRCode,
  renderWhatsApp,
  verificarNumeroWhatsApp,
  processarCampanha,
  pausarCampanha,
  cancelarCampanha,
  desconectar,
  getClient: () => whatsappClient,
  getWebhookUrls,
  saveWebhookUrls
}; 