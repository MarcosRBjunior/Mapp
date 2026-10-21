export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A API está no ar */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description API no ar */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["HealthResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A API tem dados carregados */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Pronta para servir dados */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReadyResponse"];
                    };
                };
                /** @description DATA_NOT_READY: sem dados ou banco indisponível */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/meta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Fonte, licença, cobertura, data de referência e último sync */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Metadados */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MetaResponse"];
                    };
                };
                /** @description RATE_LIMITED: mais de 120 requisições por minuto */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description INTERNAL_ERROR */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/global": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Totais globais (soma dos países) numa data */
        get: {
            parameters: {
                query?: {
                    date?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Totais globais */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GlobalResponse"];
                    };
                };
                /** @description VALIDATION_ERROR: parâmetro inválido ou data fora da cobertura */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description RATE_LIMITED: mais de 120 requisições por minuto */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description INTERNAL_ERROR */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description DATA_NOT_READY: nenhum dado carregado ainda */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/countries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Países para o mapa, com o valor da métrica na data */
        get: {
            parameters: {
                query?: {
                    metric?: components["schemas"]["Metric"];
                    date?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Lista de países */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CountriesListResponse"];
                    };
                };
                /** @description VALIDATION_ERROR: parâmetro inválido ou data fora da cobertura */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description RATE_LIMITED: mais de 120 requisições por minuto */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description INTERNAL_ERROR */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description DATA_NOT_READY: nenhum dado carregado ainda */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/countries/{code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalhe de um país, com participação % e posição no ranking */
        get: {
            parameters: {
                query?: {
                    date?: string;
                };
                header?: never;
                path: {
                    /** @description Código ISO3 do país (maiúsculas ou minúsculas) */
                    code: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Detalhe do país */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CountryDetailResponse"];
                    };
                };
                /** @description VALIDATION_ERROR: parâmetro inválido ou data fora da cobertura */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description COUNTRY_NOT_FOUND */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description RATE_LIMITED: mais de 120 requisições por minuto */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description INTERNAL_ERROR */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description DATA_NOT_READY: nenhum dado carregado ainda */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /**
         * @description cases = casos, deaths = mortes
         * @enum {string}
         */
        Metric: "cases" | "deaths";
        HealthResponse: {
            /** @constant */
            status: "ok";
        };
        ReadyResponse: {
            /** @constant */
            status: "ready";
            dataVersion: number;
            referenceDate: string;
        };
        ErrorResponse: {
            error: {
                /** @enum {string} */
                code: "VALIDATION_ERROR" | "COUNTRY_NOT_FOUND" | "NOT_FOUND" | "RATE_LIMITED" | "DATA_NOT_READY" | "INTERNAL_ERROR";
                message: string;
                details: unknown | null;
                requestId: string;
            };
        };
        MetaResponse: {
            source: {
                code: string;
                name: string;
                url: string;
                license: string;
                attribution: string;
            };
            coverage: {
                from: string;
                to: string;
                countries: number;
            } | null;
            referenceDate: string | null;
            lastSync: {
                /** @enum {string} */
                status: "success" | "partial" | "failed";
                /** @enum {string} */
                mode: "snapshot" | "full";
                startedAt: string;
                finishedAt: string;
            } | null;
            dataVersion: number | null;
            nonGeographic: {
                code: string;
                name: string;
            }[];
        };
        GlobalResponse: {
            date: string;
            cases: components["schemas"]["MetricValue"];
            deaths: components["schemas"]["MetricValue"];
            countryCount: number;
        };
        MetricValue: {
            total: number;
            new: number;
        };
        CountriesListResponse: {
            date: string;
            metric: components["schemas"]["Metric"];
            countries: {
                code: string;
                name: string;
                lat: number | null;
                lng: number | null;
                total: number | null;
                new: number | null;
            }[];
        };
        CountryDetailResponse: {
            date: string;
            country: {
                code: string;
                name: string;
                lat: number | null;
                lng: number | null;
                population: number | null;
            };
            cases: components["schemas"]["MetricValue"] | null;
            deaths: components["schemas"]["MetricValue"] | null;
            comparison: {
                cases: components["schemas"]["MetricComparison"];
                deaths: components["schemas"]["MetricComparison"];
            };
        };
        MetricComparison: {
            share: number | null;
            rank: number | null;
            rankedCount: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
