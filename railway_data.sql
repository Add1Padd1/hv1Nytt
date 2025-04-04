--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4 (Debian 16.4-1.pgdg120+2)
-- Dumped by pg_dump version 17.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, email, password, admin, created, updated, slug) FROM stdin;
17	admin	admin@example.com	$2b$10$a.vw1.4aAbaChhPAhY15musTSRduRMYOqmoNEhIoVeApZlXZcKdzW	t	2025-03-13 19:01:51	\N	user_17
18	jonas	jonas@example.com	$2b$10$v00YWjqVsW.AxtuQyS/hoOkLhT2biedpD.jw/0YHZIr8j1ElAwnv.	f	2025-03-13 19:01:51	\N	user_18
19	katrin	katrin@example.com	$2b$10$4cxF/98PGpt0ZxRNJRJXouUzK59m5b.nTs6uJ8jjwQS5oy4BNrqSG	f	2025-03-13 19:01:52	\N	user_19
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts (id, user_id, account_name, balance, created, slug) FROM stdin;
16	17	A├░alreikningur	5000.00	2025-03-13 19:01:52	account_16
17	18	J├│nas reikningur	2500.00	2025-03-13 19:01:52	account_17
18	19	Katr├¡ns reikningur	3000.00	2025-03-13 19:01:52	account_18
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, slug) FROM stdin;
19	matur	category_19
20	├¡b├║├░	category_20
21	samg├╢ngur	category_21
22	af├╛reying	category_22
23	laun	category_23
24	annar	category_24
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budgets (id, user_id, category, monthly_limit, created, slug) FROM stdin;
7	17	matur	400.00	2025-03-13 19:01:56	budget_7
8	17	├¡b├║├░	1300.00	2025-03-13 19:01:56	budget_8
9	18	matur	350.00	2025-03-13 19:01:56	budget_9
10	18	samg├╢ngur	150.00	2025-03-13 19:01:56	budget_10
11	19	matur	450.00	2025-03-13 19:01:56	budget_11
12	19	├¡b├║├░	1200.00	2025-03-13 19:01:56	budget_12
\.


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_methods (id, name, slug) FROM stdin;
10	rei├░uf├⌐	payment_method_10
11	kreditkort	payment_method_11
12	bankamillif├ªrsla	payment_method_12
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, account_id, user_id, payment_method_id, transaction_type, category, amount, description, slug) FROM stdin;
51	16	17	10	income	laun	6000.00	Laun fyrir m├ínu├░inn	transaction_51
52	16	17	11	expense	matur	150.00	Morgunmatur	transaction_52
53	16	17	12	expense	samg├╢ngur	50.00	Str├ªt├│ mi├░a	transaction_53
54	16	17	10	expense	├¡b├║├░	1200.00	Leiga	transaction_54
55	16	17	11	expense	af├╛reying	200.00	Kv├╢ldb├¡├│	transaction_55
56	16	17	12	expense	annar	100.00	├ôv├ªnt ├║tgj├╢ld	transaction_56
57	16	17	10	income	laun	300.00	Bonus	transaction_57
58	16	17	11	expense	matur	100.00	N├ªturmatur	transaction_58
59	16	17	12	expense	samg├╢ngur	75.00	Taksi	transaction_59
60	16	17	10	expense	├¡b├║├░	1150.00	Heildar leiga	transaction_60
61	17	18	10	income	laun	4000.00	Laun	transaction_61
62	17	18	11	expense	matur	120.00	Frokostur	transaction_62
63	17	18	12	expense	samg├╢ngur	40.00	Taksi	transaction_63
64	17	18	10	expense	├¡b├║├░	900.00	Leiga	transaction_64
65	17	18	11	expense	af├╛reying	180.00	Veisla	transaction_65
66	17	18	12	expense	annar	80.00	Anna├░	transaction_66
67	17	18	10	income	laun	200.00	Vi├░b├│t	transaction_67
68	17	18	11	expense	matur	90.00	Kv├╢ldmatur	transaction_68
69	17	18	12	expense	samg├╢ngur	55.00	Str├ªt├│	transaction_69
70	17	18	10	expense	├¡b├║├░	950.00	Leiga	transaction_70
71	18	19	10	income	laun	5000.00	Laun	transaction_71
72	18	19	11	expense	matur	130.00	Morgunmatur	transaction_72
73	18	19	12	expense	samg├╢ngur	60.00	Str├ªt├│	transaction_73
74	18	19	10	expense	├¡b├║├░	1100.00	Leiga	transaction_74
75	18	19	11	expense	af├╛reying	150.00	Kv├╢ldforrit	transaction_75
76	18	19	12	expense	annar	70.00	Anna├░	transaction_76
77	18	19	10	income	laun	250.00	Vi├░b├│t	transaction_77
78	18	19	11	expense	matur	95.00	H├ídegismatur	transaction_78
79	18	19	12	expense	samg├╢ngur	45.00	Taksi	transaction_79
80	18	19	10	expense	├¡b├║├░	1050.00	Leiga	transaction_80
\.


--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.accounts_id_seq', 18, true);


--
-- Name: budgets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.budgets_id_seq', 12, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 24, true);


--
-- Name: payment_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payment_methods_id_seq', 12, true);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.transactions_id_seq', 80, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 19, true);


--
-- PostgreSQL database dump complete
--

