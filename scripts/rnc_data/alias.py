# -*- coding: utf-8 -*-
"""Apelidos wiki -> (nome no RNC, UF). So entradas CONFIRMADAS: onde nao ha certeza, deixa
de fora e o clube fica marcado como ausente do RNC, que e um buraco declarado em vez de um
falso positivo silencioso."""
ALIAS = {
 '4 de Julho':              ('Quatro de Julho','PI'),
 'Atlético Cearense':       ('Atlético','CE'),
 'Brasil de Pelotas':       ('Brasil','RS'),
 'CA Patrocinense':         ('Patrocinense','MG'),
 'Gazin Porto Velho':       ('Porto Velho','RO'),
 'Grêmio Novorizontino':    ('Novorizontino','SP'),
 'Operário CEOV':           ('Operário','MT'),
 'Operário  CEOV':          ('Operário','MT'),
 'Potiguar de Mossoró':     ('Potiguar','RN'),
 'Santa Cruz de Natal':     ('Santa Cruz','RN'),
 'São Joseense':            ('Sãojoseense','PR'),
 'São José-POA':            ('São José','RS'),
 'União Rondonópolis':      ('União','MT'),
 'Vasco':                   ('Vasco da Gama','RJ'),
 'Ypiranga de Erechim':     ('Ypiranga','RS'),
 # 'Uniao AC' = Uniao Atletico Clube (TO). Confirmado pela aritmetica: o RNC 2026 do
 # Uniao/TO e 505 = 5 x (51 da Serie D 2025 + 50 da 2a fase da Copa do Brasil 2025).
 'União AC':                ('União','TO'),
}
# Desambiguacao de nomes SEM sufixo que colidem no RNC. Fonte: convencao da Wikipedia
# (o nome sem sufixo e sempre o clube "primario") confirmada contra o UF_MAP do app.
DISAMB = {
 'Atlético':'MG', 'América':'MG', 'Botafogo':'RJ', 'Cruzeiro':'MG', 'Fluminense':'RJ',
 'Juventude':'RS', 'Náutico':'PE', 'Operário':'PR', 'Portuguesa':'SP', 'Santa Cruz':'PE',
 'São José':'RS', 'São Raimundo':'RR', 'Vitória':'BA', 'Ypiranga':'RS', 'Nacional':'AM',
 'Rio Branco':'ES', 'Barcelona':'BA', 'União':'MT', 'Capital':'DF',
}
