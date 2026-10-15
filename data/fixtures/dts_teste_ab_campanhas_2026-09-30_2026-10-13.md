# Campanhas ativas em `op_dashs_interativos.dts_teste_ab` (30/09 a 13/10/2026)

Extraído em 14/10/2026 com a consulta 1 de `data/queries/reconciliacao_dts_teste_ab.sql`. Resumo por campanha (variantes e plataformas); sessões aproximadas do período.

| Campanha | Variantes vistas | Plataformas | BU | Sessões (maior variante) |
| --- | --- | --- | --- | --- |
| Nexus \| Nova Home do App | home antiga, home nova | ANDROID, IOS | ecom | 955 mil (Android, home nova); controle 4,3 mil / 6,0 mil |
| [ Saude EXP ] - EmbeddedCopayment | showEmbeddedCopayment | WEB | plano-de-saude | 593 mil |
| Teste Banner Home | Formato Antigo, Formato Novo | ANDROID, IOS | ecom | 511 mil |
| [Saúde Aquisição] Modal de CEP | cep_modal | WEB | saude | 280 mil (até 07/10) |
| [Saúde Aquisição] Clube gratuito | control group, variant-clube-free, variant-clube-paid-all | WEB | saude | 220 mil |
| Clube no carrinho | Clube ligado - acima do cupom | ANDROID, IOS | ecom | 197 mil |
| AQSI \| Card de Repet no carrinho | Repet visível pra todos | ANDROID, IOS | ecom | 186 mil |
| [Delivery] - Devolução e cancelamento por entrega | Devolução e cancelamento por entrega | WEB | ecom, whitelabel | 145 mil |
| PDP com Clube / PDP sem Clube e sem Repet / PDP com Clube e com Repet / PDP com Repet | com clube | ANDROID, IOS | ecom | 141 mil |
| SAUEXP \| Copart embutida | Copart embutida | ANDROID, IOS | ecom | 137 mil |
| [Ecom Fidelidade] TKM - Upsize de embalagem PDP - WEB | do_nothing_action, variation b - upsize de embalagem | WEB (Mobile, Desktop) | ecom | 112 mil |
| [ Saude RET ] - Cancelamento no financeiro | showFinancialCancellation | WEB | plano-de-saude | 94 mil |
| AQSI \| Checkout Club Step Android | Variante | ANDROID, IOS | ecom | 87 mil |
| HOME ALL - CARROSSEL | ns_nc_nr_1…20, ns_c_nr_1…17, ns_c_r_1…17, s_c_nr_1…16, s_c_r_1…16, s_nc_nr_1…19, s_nc_r_1…19, ns_nc_r_1…20 (experiências por segmento Saúde/Clube/Repet) | WEB | ecom | 86 mil |
| [AQUISIÇÃO][A/B] - Brinde Copa Feature (kill switch) | Variante B | WEB | ecom | 80 mil |
| [Saúde Aquisição] Oferecer Clube Plus | control group | WEB | saude | 77 mil (até 04/10) |
| [Ecom Aquisição] Novo layout modal do catálogo - WEB | do_nothing_action, Variante B, Variante C | WEB (Mobile, Desktop) | ecom | 66 mil |
| [ Saude RET ] - Dropout | control group, showDropout | WEB | plano-de-saude | 55 mil |
| [Ecom Aquisição] Novo layout cards do catálogo | variation b | WEB | ecom | 45 mil (desde 05/10) |
| [FIDE] Modal de variantes - Novo layout do card catálogo - APP | Controle, Variante B, Variante C | ANDROID, IOS | ecom | 30 mil |
| FIDE \| Android / iOS \| Modal Upsize Embalagem | Controle (sem modal…), Variante (com modal…) | ANDROID, IOS | ecom | 28 mil |
| FIDE \| Android / iOS \| Repet Incentivo Histórico | Controle (sem recomendação histórica), Variante (com recomendação histórica) | ANDROID, IOS | ecom | 23 mil |
| [Ecom aquisição] Pagina intermediaria do Clube | variante a (experiências: logados com plano, logados, deslogados) | ANDROID, IOS | ecom | 20 mil |
| Teste Modal de Bundle | Primeira Vez, Após rede, Após sete dias | ANDROID, IOS | ecom | 13 mil |
| [Ecom Fidelidade] PDP com melhor custo benefício selecionado - APP | Controle - novo layout do card, Variante B - best deal selecionada, Variante C - secundária selecionada | ANDROID, IOS | ecom | 12 mil (desde 09/10) |
| [ Saude RET ] - Pausa no plano | control group, showFreezePetPlan | WEB | plano-de-saude | 9 mil |
| [Ecom Fidelidade] Incluir counter na vitrine da Pagina Intermediária - App | Controle - botão "Adicionar", Variante - counter | ANDROID, IOS | ecom | 8 mil |
| [Ecom Fidelidade] Novo layout das vitrines da busca - APP | Controle - card atual, Variante B - card horizontal, Variante C - card vertical | ANDROID, IOS | ecom | 8 mil |
| [Fidelidade][A/B] Teste A/B - Global Economy Home | com card | ANDROID, IOS | ecom | 4 mil |
| [Aquisição][A/B] - Mapa de confirmação de endereço | do_nothing_action, Variant B | WEB | ecom | 4 mil (até 02/10) |
| DLV \| iOS \| Informações complementares endereço | controle, Informações Complementares | IOS | ecom | 4 mil |
| GROWTH - Filtro de entrega no mesmo dia / Componente de Estoque em Lojas Físicas | Habilitado / Componente habilitado | ANDROID, IOS | ecom | 2 mil |
| [Clube] - area de gestão | [Institucional Retenção Clube] Brinde… | WEB | ecom | 2 mil |
| [Ecom Aquisição] Nova LP clube | do_nothing_action, variation b, c, d | WEB, ANDROID, IOS | ecom | 2 mil |
| SAUEXP \| Buscar atendimento na Home | Variação A - controle, B, C, D | ANDROID, IOS | ecom | 2 mil |
| [Experiência] Teste A/B/C Modal de Produto no Catálogo | modal_de_produto_ativado | ANDROID, IOS | ecom | 2 mil |

Observações para o Faro:
- Há linhas com `nm_campanha`, `nm_variante` ou `nm_plataforma` vazios (21,8 mil e 14,8 mil sessões): sujeira a tratar nos testes de qualidade.
- Campanhas de app vêm com `nm_experiencia = 'nao-disponivel'`; as de web trazem a experiência (Mobile/Desktop/segmento).
- Nomes de controle são heterogêneos: `control group`, `do_nothing_action`, `Controle…`, `controle`, `Formato Antigo`, `home antiga`, `Variação A - controle`. A importação de legados (frente 1/2) precisa de uma lista de padrões e de confirmação manual.
- Várias campanhas só mostram a variante (sem linha de controle), ex.: Clube no carrinho, Card de Repet, Copart embutida, EmbeddedCopayment: são rollouts ou personalizações, não testes A/B.
- `HOME ALL - CARROSSEL` tem dezenas de experiências por segmento: é personalização, não teste; deve ficar fora do painel de experimentos.
- Lista útil para a frente 3 (sobreposição): Nexus, Teste Banner Home, Global Economy Home e Buscar atendimento na Home rodam ao mesmo tempo na home do app.
