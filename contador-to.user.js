// ==UserScript==
// @name         SPX TO REPORT AUTO
// @namespace    SPX-TO-REPORT
// @version      2.1
// @description  SPX TO Management - Auto Sheets + CSV
// @match        https://spx.shopee.com.br/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {

    'use strict';

    console.log('[SPX TO] Script iniciado - v2.1');

    const API = 'https://spx.shopee.com.br';

    const TO_API =
        '/api/in-station/general_to/outbound/search';

    const APPS_SCRIPT_URL =
        'https://script.google.com/a/macros/shopee.com/s/AKfycbyjp2Xpzu2S2y_0XMOkoa36iHJMKPTfBrQ4vSOEAtfKpNXrHk08ZYVHq8TRWRhXcowv/exec';

    const INTERVALO_MINUTOS = 10;

    const INTERVALO_MS =
        INTERVALO_MINUTOS * 60 * 1000;

    const QUANTIDADE_POR_PAGINA = 24;

    let tos = [];

    let running = false;
    let stopped = false;

    let automacaoAtiva = true;

    let ultimaAtualizacao = null;
    let proximaExecucao = null;

    let timerLoop = null;
    let timerContagem = null;


    function $(id) {
        return document.getElementById(id);
    }


    function esperar(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }


    function hojeISO() {

        const agora = new Date();

        const ano =
            agora.getFullYear();

        const mes =
            String(
                agora.getMonth() + 1
            ).padStart(2, '0');

        const dia =
            String(
                agora.getDate()
            ).padStart(2, '0');

        return `${ano}-${mes}-${dia}`;
    }


    function timestamp(
        dateString,
        endOfDay = false
    ) {

        const [year, month, day] =
            dateString
                .split('-')
                .map(Number);

        const date =
            new Date(
                year,
                month - 1,
                day,
                endOfDay ? 23 : 0,
                endOfDay ? 59 : 0,
                endOfDay ? 59 : 0
            );

        return Math.floor(
            date.getTime() / 1000
        );
    }


    function formatDate(timestampValue) {

        if (
            timestampValue === null ||
            timestampValue === undefined ||
            timestampValue === '' ||
            Number(timestampValue) === 0
        ) {
            return '';
        }

        const date =
            new Date(
                Number(timestampValue) * 1000
            );

        if (isNaN(date.getTime())) {
            return String(timestampValue);
        }

        return date.toLocaleString('pt-BR');
    }


    function formatHora(date) {

        if (!date) {
            return '--:--:--';
        }

        return date.toLocaleTimeString(
            'pt-BR'
        );
    }


    function setStatus(
        mensagem,
        tipo = 'normal'
    ) {

        const el =
            $('spx-status');

        if (!el) {
            return;
        }

        let cor = '#ee4d2d';

        if (tipo === 'ok') {
            cor = '#188038';
        }

        if (tipo === 'erro') {
            cor = '#d93025';
        }

        if (tipo === 'alerta') {
            cor = '#f9ab00';
        }

        el.style.borderLeft =
            `4px solid ${cor}`;

        el.innerHTML =
            mensagem;
    }


    async function getJSON(url) {

        console.log(
            '[SPX TO] GET:',
            url
        );

        const response =
            await fetch(
                url,
                {
                    method: 'GET',
                    credentials: 'include'
                }
            );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }

        return await response.json();
    }


    function converterTO(to) {

        return {

            to_number:
                to.to_number ?? '',

            driver:
                to.driver_name ?? '',

            to_pack:
                to.pack_name ?? '',

            packing_method:
                to.packing_method ?? '',

            receiver_type:
                to.receiver_type ?? '',

            receiver:
                to.receiver ?? '',

            current_station:
                to.current_station_name ?? '',

            quantity:
                to.quantity ?? '',

            weight:
                to.weight ?? '',

            direction:
                to.display_direction ?? '',

            remark:
                to.remark ?? '',

            operator:
                to.operator ?? '',

            status:
                to.status ?? '',

            sender:
                to.sender ?? '',

            create_time:
                formatDate(to.ctime),

            complete_time:
                formatDate(
                    to.complete_time
                ),

            staging_area:
                to.staging_area_id ?? ''

        };
    }


    async function buscarTOs() {

        if (running) {
            return false;
        }

        const inicio =
            $('spx-data-inicial')
                ? $('spx-data-inicial').value
                : hojeISO();

        const fim =
            $('spx-data-final')
                ? $('spx-data-final').value
                : hojeISO();

        if (!inicio || !fim) {

            throw new Error(
                'Datas inválidas.'
            );
        }

        const inicioTS =
            timestamp(
                inicio,
                false
            );

        const fimTS =
            timestamp(
                fim,
                true
            );

        running = true;
        stopped = false;

        tos = [];

        atualizarBotoes();

        try {

            let pagina = 1;

            while (!stopped) {

                setStatus(
                    `
                    🔎 Buscando TOs...
                    <br>
                    Página:
                    <strong>${pagina}</strong>
                    <br>
                    Encontrados:
                    <strong>${tos.length}</strong>
                    `
                );

                const url =
                    API +
                    TO_API +
                    '?pageno=' +
                    pagina +
                    '&count=' +
                    QUANTIDADE_POR_PAGINA +
                    '&ctime=' +
                    inicioTS +
                    ',' +
                    fimTS;

                const json =
                    await getJSON(url);

                if (
                    json.retcode !== 0
                ) {

                    throw new Error(
                        json.message ||
                        'Erro retornado pela API SPX.'
                    );
                }

                const lista =
                    json?.data?.list;

                if (!Array.isArray(lista)) {

                    throw new Error(
                        'Lista de TOs não encontrada.'
                    );
                }

                if (lista.length === 0) {
                    break;
                }

                tos.push(
                    ...lista.map(
                        converterTO
                    )
                );

                atualizarPreview();

                if (
                    lista.length <
                    QUANTIDADE_POR_PAGINA
                ) {
                    break;
                }

                pagina++;

                await esperar(200);
            }


            const mapa =
                new Map();

            tos.forEach(to => {

                if (to.to_number) {

                    mapa.set(
                        to.to_number,
                        to
                    );
                }
            });

            tos =
                Array.from(
                    mapa.values()
                );

            window.__SPX_TOS__ =
                tos;

            atualizarPreview();

            setStatus(
                `
                ✅ Busca concluída
                <br>
                🚚 TOs:
                <strong>${tos.length}</strong>
                `,
                'ok'
            );

            console.log(
                `[SPX TO] ${tos.length} TOs coletados`
            );

            return true;

        } finally {

            running = false;

            atualizarBotoes();
        }
    }


    function enviarParaSheets() {

        return new Promise(
            (resolve, reject) => {

                if (
                    !Array.isArray(tos) ||
                    tos.length === 0
                ) {

                    reject(
                        new Error(
                            'Nenhum TO para enviar.'
                        )
                    );

                    return;
                }


                console.log(
                    '[SPX TO] Enviando para Sheets:',
                    tos.length
                );


                const payload =
                    JSON.stringify({
                        registros: tos
                    });


                GM_xmlhttpRequest({

                    method: 'POST',

                    url:
                        APPS_SCRIPT_URL,

                    headers: {
                        'Content-Type':
                            'application/json;charset=UTF-8'
                    },

                    data:
                        payload,

                    timeout:
                        120000,

                    redirect:
                        'follow',


                    onload:
                        function (response) {

                            console.log(
                                '[SPX TO] HTTP:',
                                response.status
                            );

                            console.log(
                                '[SPX TO] RESPOSTA:',
                                response.responseText
                            );

                            try {

                                const resposta =
                                    JSON.parse(
                                        response.responseText
                                    );

                                if (
                                    resposta.sucesso !== true
                                ) {

                                    throw new Error(
                                        resposta.erro ||
                                        'Apps Script retornou erro.'
                                    );
                                }


                                ultimaAtualizacao =
                                    new Date();


                                atualizarInfoAutomacao();


                                setStatus(
                                    `
                                    ✅ PLANILHA ATUALIZADA
                                    <br>
                                    📦 Registros:
                                    <strong>
                                        ${resposta.quantidade}
                                    </strong>
                                    <br>
                                    🕐
                                    ${formatHora(
                                        ultimaAtualizacao
                                    )}
                                    `,
                                    'ok'
                                );


                                resolve(
                                    resposta
                                );


                            } catch (erro) {

                                console.error(
                                    '[SPX TO] Erro resposta Apps Script:',
                                    erro
                                );

                                reject(
                                    erro
                                );
                            }
                        },


                    onerror:
                        function (response) {

                            console.error(
                                '[SPX TO] ERRO ENVIO:',
                                response
                            );

                            reject(
                                new Error(
                                    'Falha de comunicação com Apps Script.'
                                )
                            );
                        },


                    ontimeout:
                        function () {

                            reject(
                                new Error(
                                    'Timeout no Apps Script.'
                                )
                            );
                        }
                });
            }
        );
    }


    async function executarCiclo() {

        if (running) {
            return;
        }

        try {

            const sucesso =
                await buscarTOs();

            if (
                sucesso &&
                tos.length > 0
            ) {

                await enviarParaSheets();
            }

        } catch (erro) {

            console.error(
                '[SPX TO] Erro no ciclo:',
                erro
            );

            setStatus(
                `
                ❌ Erro no ciclo
                <br>
                ${erro.message}
                `,
                'erro'
            );
        }
    }


    function agendarProximoCiclo() {

        if (timerLoop) {

            clearTimeout(
                timerLoop
            );
        }


        if (!automacaoAtiva) {

            proximaExecucao = null;

            atualizarInfoAutomacao();

            return;
        }


        proximaExecucao =
            new Date(
                Date.now() +
                INTERVALO_MS
            );


        atualizarInfoAutomacao();


        timerLoop =
            setTimeout(
                async function () {

                    if (!automacaoAtiva) {
                        return;
                    }

                    await executarCiclo();

                    agendarProximoCiclo();

                },
                INTERVALO_MS
            );
    }


    async function iniciarAutomacao() {

        automacaoAtiva = true;

        atualizarBotoes();

        atualizarInfoAutomacao();

        await executarCiclo();

        agendarProximoCiclo();
    }


    function pausarAutomacao() {

        automacaoAtiva = false;


        if (timerLoop) {

            clearTimeout(
                timerLoop
            );

            timerLoop = null;
        }


        proximaExecucao = null;


        atualizarBotoes();

        atualizarInfoAutomacao();


        setStatus(
            '⏸ Automação pausada',
            'alerta'
        );
    }


    function iniciarContagem() {

        if (timerContagem) {

            clearInterval(
                timerContagem
            );
        }


        timerContagem =
            setInterval(
                atualizarInfoAutomacao,
                1000
            );
    }


    function atualizarInfoAutomacao() {

        const el =
            $('spx-auto-info');

        if (!el) {
            return;
        }


        let proxima =
            '--:--';

        let restante =
            '--';


        if (
            automacaoAtiva &&
            proximaExecucao
        ) {

            proxima =
                formatHora(
                    proximaExecucao
                );


            const diff =
                Math.max(
                    0,
                    proximaExecucao.getTime() -
                    Date.now()
                );


            const minutos =
                Math.floor(
                    diff / 60000
                );


            const segundos =
                Math.floor(
                    (diff % 60000) /
                    1000
                );


            restante =
                `${minutos}m ${String(
                    segundos
                ).padStart(2, '0')}s`;
        }


        el.innerHTML = `

            <div>

                ${
                    automacaoAtiva
                        ? '🟢'
                        : '🔴'
                }

                <strong>

                    ${
                        automacaoAtiva
                            ? 'Automação ativa'
                            : 'Automação pausada'
                    }

                </strong>

            </div>


            <div style="margin-top:5px;">

                Última atualização:

                <strong>

                    ${
                        ultimaAtualizacao
                            ? formatHora(
                                ultimaAtualizacao
                            )
                            : 'Ainda não executada'
                    }

                </strong>

            </div>


            <div>

                Próxima:

                <strong>
                    ${proxima}
                </strong>

            </div>


            <div>

                Restante:

                <strong>
                    ${restante}
                </strong>

            </div>
        `;
    }


    function pararBusca() {

        stopped = true;


        setStatus(
            `
            ⏳ Parando busca...
            <br>
            TOs:
            <strong>${tos.length}</strong>
            `,
            'alerta'
        );
    }


    function atualizarPreview() {

        const preview =
            $('spx-preview');

        if (!preview) {
            return;
        }


        if (tos.length === 0) {

            preview.innerHTML =
                'Nenhum TO carregado.';

            return;
        }


        const ultimos =
            tos.slice(-5);


        preview.innerHTML =
            ultimos
                .map(
                    to => `

                    <div style="
                        padding:6px 0;
                        border-bottom:1px solid #eee;
                    ">

                        <strong>
                            ${to.to_number}
                        </strong>

                        <br>

                        <span style="
                            font-size:11px;
                            color:#666;
                        ">

                            ${to.status}
                            |
                            ${to.quantity} volumes

                        </span>

                    </div>
                `
                )
                .join('');
    }


    function escaparCSV(valor) {

        if (
            valor === null ||
            valor === undefined
        ) {
            return '';
        }


        let texto =
            String(valor);


        texto =
            texto.replace(
                /\r?\n|\r/g,
                ' '
            );


        texto =
            texto.replace(
                /"/g,
                '""'
            );


        return `"${texto}"`;
    }


    function exportarCSV() {

        if (!tos.length) {

            alert(
                'Ainda não existem TOs carregados.'
            );

            return;
        }


        const cabecalho = [

            'TO Number',
            'Driver',
            'TO Pack',
            'Packing Method',
            'Receiver Type',
            'Receiver',
            'Current Station',
            'Quantity',
            'Weight',
            'Direction',
            'Remark',
            'Operator',
            'Status',
            'Sender',
            'Create Time',
            'Complete Time',
            'Staging Area'

        ];


        const linhas = [

            cabecalho
                .map(
                    escaparCSV
                )
                .join(';')

        ];


        tos.forEach(
            to => {

                linhas.push(

                    [

                        to.to_number,
                        to.driver,
                        to.to_pack,
                        to.packing_method,
                        to.receiver_type,
                        to.receiver,
                        to.current_station,
                        to.quantity,
                        to.weight,
                        to.direction,
                        to.remark,
                        to.operator,
                        to.status,
                        to.sender,
                        to.create_time,
                        to.complete_time,
                        to.staging_area

                    ]

                        .map(
                            escaparCSV
                        )

                        .join(';')

                );
            }
        );


        const csv =
            '\uFEFF' +
            linhas.join(
                '\r\n'
            );


        const blob =
            new Blob(
                [csv],
                {
                    type:
                        'text/csv;charset=utf-8;'
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                'a'
            );


        link.href =
            url;


        link.download =
            `SPX_TO_REPORT_${hojeISO()}.csv`;


        document.body.appendChild(
            link
        );


        link.click();

        link.remove();


        setTimeout(
            () =>
                URL.revokeObjectURL(
                    url
                ),
            1000
        );
    }


    function atualizarBotoes() {

        const buscar =
            $('spx-buscar');

        const exportar =
            $('spx-exportar');

        const parar =
            $('spx-parar');

        const auto =
            $('spx-toggle-auto');


        if (buscar) {

            buscar.disabled =
                running;
        }


        if (exportar) {

            exportar.disabled =
                tos.length === 0;
        }


        if (parar) {

            parar.style.display =
                running
                    ? 'block'
                    : 'none';
        }


        if (auto) {

            auto.innerHTML =
                automacaoAtiva
                    ? '⏸ PAUSAR AUTOMAÇÃO'
                    : '▶ ATIVAR AUTOMAÇÃO';
        }
    }


    function abrirPainel() {

        if (
            $('spx-to-painel')
        ) {

            $('spx-to-painel')
                .remove();

            return;
        }


        const hoje =
            hojeISO();


        const painel =
            document.createElement(
                'div'
            );


        painel.id =
            'spx-to-painel';


        painel.style.cssText = `

            position:fixed !important;
            right:20px !important;
            bottom:80px !important;

            width:390px !important;

            max-height:82vh !important;

            overflow-y:auto !important;

            background:#fff !important;

            color:#333 !important;

            border-radius:14px !important;

            padding:18px !important;

            z-index:999999 !important;

            box-shadow:
                0 8px 35px
                rgba(0,0,0,.30)
                !important;

            font-family:
                Arial,
                sans-serif
                !important;
        `;


        painel.innerHTML = `

            <div style="
                background:
                    linear-gradient(
                        135deg,
                        #ee4d2d,
                        #ff7337
                    );

                color:white;

                border-radius:12px;

                padding:14px;

                margin-bottom:15px;

                display:flex;

                align-items:center;

                gap:12px;
            ">


                <div style="
                    width:46px;
                    height:46px;

                    border-radius:12px;

                    background:white;

                    color:#ee4d2d;

                    display:flex;

                    align-items:center;

                    justify-content:center;

                    font-weight:bold;

                    font-size:25px;
                ">

                    S

                </div>


                <div style="
                    flex:1;
                ">

                    <div style="
                        font-weight:bold;
                        font-size:18px;
                    ">

                        SPX TO REPORT

                    </div>


                    <div style="
                        font-size:11px;
                        opacity:.9;
                    ">

                        Outbound Automation

                    </div>

                </div>


                <button

                    id="spx-fechar"

                    style="
                        width:32px;
                        height:32px;

                        border:none;

                        border-radius:8px;

                        background:
                            rgba(
                                255,
                                255,
                                255,
                                .18
                            );

                        color:white;

                        cursor:pointer;

                        font-size:18px;
                    "

                >

                    ✕

                </button>

            </div>


            <div

                id="spx-auto-info"

                style="
                    padding:10px;

                    background:#f7f7f7;

                    border-radius:8px;

                    font-size:12px;

                    line-height:1.5;

                    margin-bottom:14px;
                "

            >
            </div>


            <label>

                <strong>
                    Data inicial
                </strong>

            </label>


            <input

                id="spx-data-inicial"

                type="date"

                value="${hoje}"

                style="
                    width:100%;
                    box-sizing:border-box;

                    padding:8px;

                    margin:
                        5px
                        0
                        10px
                        0;

                    border:
                        1px solid #ddd;

                    border-radius:6px;
                "

            >


            <label>

                <strong>
                    Data final
                </strong>

            </label>


            <input

                id="spx-data-final"

                type="date"

                value="${hoje}"

                style="
                    width:100%;
                    box-sizing:border-box;

                    padding:8px;

                    margin:
                        5px
                        0
                        14px
                        0;

                    border:
                        1px solid #ddd;

                    border-radius:6px;
                "

            >


            <button

                id="spx-buscar"

                style="
                    width:100%;

                    padding:11px;

                    border:none;

                    border-radius:7px;

                    background:#ee4d2d;

                    color:white;

                    font-weight:bold;

                    cursor:pointer;
                "

            >

                🔄 ATUALIZAR AGORA

            </button>


            <button

                id="spx-parar"

                style="
                    display:none;

                    width:100%;

                    padding:11px;

                    margin-top:7px;

                    border:none;

                    border-radius:7px;

                    background:#333;

                    color:white;

                    font-weight:bold;

                    cursor:pointer;
                "

            >

                ⛔ PARAR BUSCA

            </button>


            <button

                id="spx-toggle-auto"

                style="
                    width:100%;

                    padding:11px;

                    margin-top:7px;

                    border:none;

                    border-radius:7px;

                    background:#444;

                    color:white;

                    font-weight:bold;

                    cursor:pointer;
                "

            >
            </button>


            <button

                id="spx-exportar"

                style="
                    width:100%;

                    padding:11px;

                    margin-top:7px;

                    border:none;

                    border-radius:7px;

                    background:#188038;

                    color:white;

                    font-weight:bold;

                    cursor:pointer;
                "

            >

                📥 EXPORTAR CSV

            </button>


            <div

                id="spx-status"

                style="
                    margin-top:14px;

                    padding:10px;

                    background:#f5f5f5;

                    border-radius:7px;

                    border-left:
                        4px solid #ee4d2d;

                    font-size:12px;

                    line-height:1.5;
                "

            >

                Aguardando...

            </div>


            <div style="
                margin-top:14px;
            ">

                <strong>
                    Últimos TOs
                </strong>


                <div

                    id="spx-preview"

                    style="
                        margin-top:7px;

                        padding:9px;

                        border:
                            1px solid #eee;

                        border-radius:7px;

                        font-size:12px;
                    "

                >

                    Nenhum TO carregado.

                </div>

            </div>


            <div style="
                margin-top:16px;

                padding-top:11px;

                border-top:
                    1px solid #eee;

                text-align:left;

                font-size:10px;

                line-height:1.5;

                color:#777;
            ">


                <div>

                    <strong>
                        Criado por @peedro_zo
                    </strong>

                </div>


                <div>

                    Ideia surgiu em Out FRC2

                </div>


                <div style="
                    margin-top:3px;

                    color:#aaa;
                ">

                    SPX TO REPORT • v2.1

                </div>

            </div>
        `;


        document.body.appendChild(
            painel
        );


        $('spx-fechar').onclick =
            () =>
                painel.remove();


        $('spx-buscar').onclick =
            async function () {

                await executarCiclo();

                if (
                    automacaoAtiva
                ) {

                    agendarProximoCiclo();
                }
            };


        $('spx-parar').onclick =
            pararBusca;


        $('spx-exportar').onclick =
            exportarCSV;


        $('spx-toggle-auto').onclick =
            async function () {

                if (
                    automacaoAtiva
                ) {

                    pausarAutomacao();

                } else {

                    automacaoAtiva = true;

                    atualizarBotoes();

                    atualizarInfoAutomacao();

                    await executarCiclo();

                    agendarProximoCiclo();
                }
            };


        atualizarBotoes();

        atualizarInfoAutomacao();

        atualizarPreview();
    }


    function adicionarBotao() {

        if (!document.body) {

            setTimeout(
                adicionarBotao,
                500
            );

            return;
        }


        if (
            $('spx-to-open-button')
        ) {
            return;
        }


        const button =
            document.createElement(
                'button'
            );


        button.id =
            'spx-to-open-button';


        button.innerHTML =
            'S &nbsp; SPX TO REPORT';


        button.style.cssText = `

            position:fixed !important;

            right:20px !important;

            bottom:20px !important;

            z-index:999999 !important;

            background:#ee4d2d;

            color:white;

            border:none;

            border-radius:9px;

            padding:12px 17px;

            font-size:13px;

            font-weight:bold;

            cursor:pointer;

            box-shadow:
                0 4px 15px
                rgba(0,0,0,.28);
        `;


        button.onclick =
            abrirPainel;


        document.body.appendChild(
            button
        );
    }


    adicionarBotao();

    iniciarContagem();


    setTimeout(
        function () {

            iniciarAutomacao();

        },
        5000
    );

})();
