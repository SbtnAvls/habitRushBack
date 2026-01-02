import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'HabitRush API',
    version: '1.0.0',
    description: `
API para la aplicación HabitRush - Sistema de seguimiento de hábitos gamificado.

## Autenticación
La API utiliza JWT (JSON Web Tokens) para la autenticación:
- **Access Token**: Expira en 15 minutos
- **Refresh Token**: Expira en 7 días

Para endpoints protegidos, incluir el header:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Rate Limiting
Los endpoints de autenticación tienen limitación de tasa para prevenir abusos.
    `,
    contact: {
      name: 'HabitRush Team',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Servidor de desarrollo',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ingresa tu access token JWT',
      },
    },
    schemas: {
      // Auth Schemas
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: {
            type: 'string',
            example: 'Juan Pérez',
            description: 'Nombre del usuario',
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'juan@ejemplo.com',
            description: 'Email del usuario (único)',
          },
          password: {
            type: 'string',
            minLength: 6,
            example: 'miPassword123',
            description: 'Contraseña (mínimo 6 caracteres)',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'juan@ejemplo.com',
          },
          password: {
            type: 'string',
            example: 'miPassword123',
          },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          accessToken: {
            type: 'string',
            description: 'JWT access token (expira en 15 min)',
          },
          refreshToken: {
            type: 'string',
            description: 'JWT refresh token (expira en 7 días)',
          },
          expiresIn: {
            type: 'integer',
            example: 900,
            description: 'Tiempo de expiración en segundos',
          },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: {
            type: 'string',
            description: 'El refresh token actual',
          },
        },
      },
      LogoutRequest: {
        type: 'object',
        properties: {
          refreshToken: {
            type: 'string',
            description: 'El refresh token a revocar (opcional)',
          },
        },
      },

      // User Schemas
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'ID único del usuario',
          },
          name: {
            type: 'string',
            example: 'Juan Pérez',
          },
          email: {
            type: 'string',
            format: 'email',
          },
          lives: {
            type: 'integer',
            example: 5,
            description: 'Vidas actuales',
          },
          max_lives: {
            type: 'integer',
            example: 5,
            description: 'Máximo de vidas',
          },
          total_habits: {
            type: 'integer',
            example: 3,
          },
          xp: {
            type: 'integer',
            example: 150,
            description: 'Experiencia total',
          },
          weekly_xp: {
            type: 'integer',
            example: 50,
            description: 'Experiencia de la semana actual',
          },
          league: {
            type: 'integer',
            example: 1,
            description: 'Liga actual del usuario',
          },
          theme: {
            type: 'string',
            enum: ['light', 'dark'],
            example: 'light',
          },
          font_size: {
            type: 'string',
            enum: ['small', 'medium', 'large'],
            example: 'medium',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      UpdateUserRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            example: 'Nuevo Nombre',
          },
          theme: {
            type: 'string',
            enum: ['light', 'dark'],
          },
          font_size: {
            type: 'string',
            enum: ['small', 'medium', 'large'],
          },
        },
      },

      // Habit Schemas
      Habit: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          user_id: {
            type: 'string',
            format: 'uuid',
          },
          name: {
            type: 'string',
            example: 'Hacer ejercicio',
          },
          description: {
            type: 'string',
            example: '30 minutos de cardio',
            nullable: true,
          },
          start_date: {
            type: 'string',
            format: 'date-time',
          },
          target_date: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          current_streak: {
            type: 'integer',
            example: 5,
          },
          frequency_type: {
            type: 'string',
            enum: ['daily', 'weekly', 'custom'],
          },
          frequency_days_of_week: {
            type: 'string',
            example: '1,2,3,4,5',
            description: 'Días de la semana separados por comas (1=Lunes, 7=Domingo)',
            nullable: true,
          },
          progress_type: {
            type: 'string',
            enum: ['yes_no', 'time', 'count'],
          },
          is_active: {
            type: 'boolean',
          },
          active_by_user: {
            type: 'integer',
            example: 1,
          },
          last_completed_date: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          disabled_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          disabled_reason: {
            type: 'string',
            enum: ['no_lives', 'manual'],
            nullable: true,
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      CreateHabitRequest: {
        type: 'object',
        required: ['name', 'frequency_type', 'progress_type'],
        properties: {
          name: {
            type: 'string',
            example: 'Hacer ejercicio',
          },
          description: {
            type: 'string',
            example: '30 minutos de cardio',
          },
          target_date: {
            type: 'string',
            format: 'date',
            example: '2025-12-31',
          },
          frequency_type: {
            type: 'string',
            enum: ['daily', 'weekly', 'custom'],
          },
          frequency_days_of_week: {
            type: 'array',
            items: {
              type: 'integer',
              minimum: 1,
              maximum: 7,
            },
            example: [1, 2, 3, 4, 5],
            description: 'Días de la semana (1=Lunes, 7=Domingo)',
          },
          progress_type: {
            type: 'string',
            enum: ['yes_no', 'time', 'count'],
          },
        },
      },
      UpdateHabitRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          description: {
            type: 'string',
          },
          target_date: {
            type: 'string',
            format: 'date',
          },
          frequency_type: {
            type: 'string',
            enum: ['daily', 'weekly', 'custom'],
          },
          frequency_days_of_week: {
            type: 'array',
            items: {
              type: 'integer',
            },
          },
          progress_type: {
            type: 'string',
            enum: ['yes_no', 'time', 'count'],
          },
        },
      },

      // Habit Completion Schemas
      HabitCompletion: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          habit_id: {
            type: 'string',
            format: 'uuid',
          },
          user_id: {
            type: 'string',
            format: 'uuid',
          },
          date: {
            type: 'string',
            format: 'date',
            example: '2025-01-15',
          },
          completed: {
            type: 'integer',
            example: 1,
            description: '1 = completado, 0 = no completado',
          },
          progress_type: {
            type: 'string',
            enum: ['yes_no', 'time', 'count'],
          },
          progress_value: {
            type: 'number',
            nullable: true,
            description: 'Valor de progreso (minutos para time, cantidad para count)',
          },
          target_value: {
            type: 'number',
            nullable: true,
            description: 'Valor objetivo',
          },
          notes: {
            type: 'string',
            nullable: true,
          },
          completed_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      CreateCompletionRequest: {
        type: 'object',
        required: ['date', 'completed', 'progress_type'],
        properties: {
          date: {
            type: 'string',
            format: 'date',
            example: '2025-01-15',
          },
          completed: {
            type: 'boolean',
            example: true,
          },
          progress_type: {
            type: 'string',
            enum: ['yes_no', 'time', 'count'],
          },
          progress_value: {
            type: 'number',
            example: 30,
          },
          target_value: {
            type: 'number',
            example: 60,
          },
          notes: {
            type: 'string',
            example: 'Hoy me sentí muy bien',
          },
        },
      },
      UpdateCompletionRequest: {
        type: 'object',
        required: ['notes'],
        properties: {
          notes: {
            type: 'string',
            example: 'Actualización de notas',
            nullable: true,
          },
        },
      },

      // Completion Image Schemas
      CompletionImage: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          completion_id: {
            type: 'string',
            format: 'uuid',
          },
          user_id: {
            type: 'string',
            format: 'uuid',
          },
          image_url: {
            type: 'string',
            format: 'uri',
          },
          thumbnail_url: {
            type: 'string',
            format: 'uri',
            nullable: true,
          },
          order: {
            type: 'integer',
            example: 1,
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      AddImageRequest: {
        type: 'object',
        required: ['imageUrl'],
        properties: {
          imageUrl: {
            type: 'string',
            format: 'uri',
            example: 'https://storage.example.com/images/photo.jpg',
          },
          thumbnailUrl: {
            type: 'string',
            format: 'uri',
            example: 'https://storage.example.com/thumbnails/photo.jpg',
          },
        },
      },

      // Challenge Schemas
      Challenge: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          title: {
            type: 'string',
            example: 'Madrugador',
          },
          description: {
            type: 'string',
            example: 'Completa tu hábito antes de las 7am',
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
          },
          type: {
            type: 'string',
            enum: ['exercise', 'learning', 'mindfulness', 'creative'],
          },
          estimated_time: {
            type: 'integer',
            description: 'Tiempo estimado en minutos',
          },
          is_active: {
            type: 'boolean',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      UserChallenge: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          user_id: {
            type: 'string',
            format: 'uuid',
          },
          habit_id: {
            type: 'string',
            format: 'uuid',
          },
          challenge_id: {
            type: 'string',
            format: 'uuid',
          },
          status: {
            type: 'string',
            enum: ['assigned', 'completed', 'expired', 'discarded'],
          },
          assigned_at: {
            type: 'string',
            format: 'date-time',
          },
          completed_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          challenge_title: {
            type: 'string',
          },
          challenge_description: {
            type: 'string',
          },
          challenge_difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
          },
          challenge_type: {
            type: 'string',
            enum: ['exercise', 'learning', 'mindfulness', 'creative'],
          },
        },
      },
      AssignChallengeRequest: {
        type: 'object',
        required: ['habitId'],
        properties: {
          habitId: {
            type: 'string',
            format: 'uuid',
            description: 'ID del hábito al que asignar el desafío',
          },
        },
      },
      UpdateChallengeStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['completed', 'discarded'],
          },
        },
      },

      // Life Challenge Schemas
      LifeChallenge: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          title: {
            type: 'string',
            example: 'Racha de 7 días',
          },
          description: {
            type: 'string',
            example: 'Mantén una racha de 7 días consecutivos',
          },
          reward: {
            type: 'integer',
            example: 1,
            description: 'Vidas que se obtienen al completar',
          },
          redeemable_type: {
            type: 'string',
            enum: ['once', 'unlimited'],
          },
          icon: {
            type: 'string',
          },
          is_active: {
            type: 'boolean',
          },
        },
      },
      LifeChallengeStatus: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          title: {
            type: 'string',
          },
          description: {
            type: 'string',
          },
          reward: {
            type: 'integer',
          },
          status: {
            type: 'string',
            enum: ['pending', 'obtained', 'redeemed'],
          },
          can_redeem: {
            type: 'boolean',
          },
        },
      },
      RedeemResponse: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
          },
          livesGained: {
            type: 'integer',
          },
          success: {
            type: 'boolean',
          },
        },
      },

      // League Schemas
      League: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
          },
          name: {
            type: 'string',
            example: 'Bronce',
          },
          colorHex: {
            type: 'string',
            example: '#CD7F32',
          },
        },
      },
      LeagueCompetitor: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          weeklyXp: {
            type: 'integer',
          },
          position: {
            type: 'integer',
          },
          isReal: {
            type: 'boolean',
          },
          userId: {
            type: 'string',
            nullable: true,
          },
        },
      },
      CurrentLeagueResponse: {
        type: 'object',
        properties: {
          league: {
            $ref: '#/components/schemas/League',
          },
          competitors: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/LeagueCompetitor',
            },
          },
        },
      },
      LeagueHistoryEntry: {
        type: 'object',
        properties: {
          weeklyXp: {
            type: 'integer',
          },
          position: {
            type: 'integer',
          },
          changeType: {
            type: 'string',
            enum: ['promoted', 'relegated', 'stayed'],
          },
          leagueName: {
            type: 'string',
          },
          leagueColor: {
            type: 'string',
          },
          weekStart: {
            type: 'string',
            format: 'date',
          },
        },
      },

      // Notification Schemas
      Notification: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
          },
          user_id: {
            type: 'string',
            format: 'uuid',
          },
          type: {
            type: 'string',
            enum: ['habit_reminder', 'life_warning', 'challenge_available', 'league_update'],
          },
          title: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
          related_habit_id: {
            type: 'string',
            nullable: true,
          },
          is_read: {
            type: 'boolean',
          },
          scheduled_for: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          sent_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },

      // Error Schemas
      Error: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
          },
        },
      },
      SuccessMessage: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
          },
          success: {
            type: 'boolean',
          },
        },
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Token de acceso faltante o inválido',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              message: 'Not authenticated',
            },
          },
        },
      },
      NotFoundError: {
        description: 'Recurso no encontrado',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
          },
        },
      },
      BadRequestError: {
        description: 'Datos de entrada inválidos',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
          },
        },
      },
      ServerError: {
        description: 'Error interno del servidor',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
            example: {
              message: 'Server error',
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: 'Auth',
      description: 'Endpoints de autenticación',
    },
    {
      name: 'Users',
      description: 'Gestión del perfil de usuario',
    },
    {
      name: 'Habits',
      description: 'CRUD de hábitos',
    },
    {
      name: 'Completions',
      description: 'Registro de completados de hábitos',
    },
    {
      name: 'Images',
      description: 'Gestión de imágenes de completados',
    },
    {
      name: 'Challenges',
      description: 'Desafíos para hábitos',
    },
    {
      name: 'Life Challenges',
      description: 'Desafíos para obtener vidas extra',
    },
    {
      name: 'Leagues',
      description: 'Sistema de ligas y clasificación',
    },
    {
      name: 'Notifications',
      description: 'Notificaciones del usuario',
    },
  ],
  paths: {
    // ==================== AUTH ====================
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar nuevo usuario',
        description: 'Crea una nueva cuenta de usuario y devuelve tokens de autenticación',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RegisterRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Usuario registrado exitosamente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthResponse',
                },
              },
            },
          },
          400: {
            description: 'Datos inválidos o usuario ya existe',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  missingFields: {
                    value: { message: 'name, email and password are required' },
                  },
                  shortPassword: {
                    value: { message: 'Password must be at least 6 characters long' },
                  },
                  userExists: {
                    value: { message: 'User already exists' },
                  },
                },
              },
            },
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        description: 'Autentica un usuario y devuelve tokens de acceso',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LoginRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login exitoso',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthResponse',
                },
              },
            },
          },
          400: {
            description: 'Credenciales inválidas',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  missingFields: {
                    value: { message: 'email and password are required' },
                  },
                  invalidCredentials: {
                    value: { message: 'Invalid credentials' },
                  },
                },
              },
            },
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refrescar token de acceso',
        description: 'Obtiene un nuevo access token usando el refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RefreshRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Token refrescado exitosamente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AuthResponse',
                },
              },
            },
          },
          400: {
            description: 'Refresh token requerido',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          401: {
            description: 'Token inválido o expirado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  invalidToken: {
                    value: { message: 'Invalid or expired refresh token' },
                  },
                  revokedToken: {
                    value: { message: 'Token has been revoked' },
                  },
                },
              },
            },
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Obtener usuario actual',
        description: 'Devuelve los datos del usuario autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Datos del usuario',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            description: 'Usuario no encontrado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Cerrar sesión',
        description: 'Revoca los tokens del usuario',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LogoutRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Logout exitoso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Successfully logged out',
                    },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== USERS ====================
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Obtener perfil del usuario',
        description: 'Devuelve el perfil completo del usuario autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Perfil del usuario',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Actualizar perfil del usuario',
        description: 'Actualiza nombre, tema o tamaño de fuente',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateUserRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Perfil actualizado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User',
                },
              },
            },
          },
          400: {
            description: 'Datos inválidos',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  noFields: {
                    value: { message: 'At least one field (name, theme, font_size) is required' },
                  },
                  invalidTheme: {
                    value: { message: 'Invalid theme provided' },
                  },
                  invalidFontSize: {
                    value: { message: 'Invalid font_size provided' },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Eliminar cuenta de usuario',
        description: 'Elimina permanentemente la cuenta del usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          204: {
            description: 'Cuenta eliminada',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/users/me/challenges': {
      get: {
        tags: ['Users'],
        summary: 'Obtener desafíos del usuario',
        description: 'Lista todos los desafíos asignados al usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de desafíos',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/UserChallenge',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/users/me/challenges/{id}': {
      put: {
        tags: ['Users'],
        summary: 'Actualizar estado de desafío',
        description: 'Marca un desafío como completado o descartado',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
            description: 'ID del user challenge',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateChallengeStatusRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Estado actualizado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserChallenge',
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/BadRequestError',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/users/me/league-history': {
      get: {
        tags: ['Users'],
        summary: 'Obtener historial de ligas',
        description: 'Lista el historial de participación en ligas del usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Historial de ligas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/LeagueHistoryEntry',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/users/me/life-history': {
      get: {
        tags: ['Users'],
        summary: 'Obtener historial de vidas',
        description: 'Lista el historial de cambios de vidas del usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Historial de vidas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      user_id: { type: 'string' },
                      change_type: { type: 'string' },
                      amount: { type: 'integer' },
                      lives_before: { type: 'integer' },
                      lives_after: { type: 'integer' },
                      created_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/users/me/notifications': {
      get: {
        tags: ['Users'],
        summary: 'Obtener notificaciones',
        description: 'Lista todas las notificaciones del usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de notificaciones',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Notification',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== HABITS ====================
    '/habits': {
      get: {
        tags: ['Habits'],
        summary: 'Listar hábitos',
        description: 'Obtiene todos los hábitos del usuario autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de hábitos',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Habit',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      post: {
        tags: ['Habits'],
        summary: 'Crear hábito',
        description: 'Crea un nuevo hábito para el usuario',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateHabitRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Hábito creado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Habit',
                },
              },
            },
          },
          400: {
            description: 'Datos inválidos',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                examples: {
                  missingFields: {
                    value: { message: 'name, frequency_type and progress_type are required' },
                  },
                  invalidFrequency: {
                    value: { message: 'Invalid frequency_type provided' },
                  },
                  invalidProgress: {
                    value: { message: 'Invalid progress_type provided' },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/habits/{id}': {
      get: {
        tags: ['Habits'],
        summary: 'Obtener hábito',
        description: 'Obtiene un hábito específico por ID',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
            description: 'ID del hábito',
          },
        ],
        responses: {
          200: {
            description: 'Datos del hábito',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Habit',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      put: {
        tags: ['Habits'],
        summary: 'Actualizar hábito',
        description: 'Actualiza los datos de un hábito',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateHabitRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Hábito actualizado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessMessage',
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/BadRequestError',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      delete: {
        tags: ['Habits'],
        summary: 'Eliminar hábito',
        description: 'Elimina un hábito (soft delete)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          204: {
            description: 'Hábito eliminado',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/habits/{id}/deactivate': {
      post: {
        tags: ['Habits'],
        summary: 'Desactivar hábito',
        description: 'Desactiva un hábito y limpia su progreso (excepto notas)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          200: {
            description: 'Hábito desactivado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Habit deactivated successfully. Progress has been cleared except for notes.',
                    },
                    success: {
                      type: 'boolean',
                      example: true,
                    },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== COMPLETIONS ====================
    '/habits/{habitId}/completions': {
      get: {
        tags: ['Completions'],
        summary: 'Listar completados de un hábito',
        description: 'Obtiene todos los registros de completado de un hábito',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'habitId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          200: {
            description: 'Lista de completados',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/HabitCompletion',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      post: {
        tags: ['Completions'],
        summary: 'Crear o actualizar completado',
        description: 'Registra un completado para una fecha específica. Si ya existe uno para esa fecha, lo actualiza.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'habitId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateCompletionRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Completado creado/actualizado',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/HabitCompletion' },
                    {
                      type: 'object',
                      properties: {
                        current_streak: {
                          type: 'integer',
                          description: 'Racha actual del hábito',
                        },
                        new_life_challenges_obtained: {
                          type: 'array',
                          items: {
                            $ref: '#/components/schemas/LifeChallengeStatus',
                          },
                          description: 'Nuevos life challenges obtenidos',
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/BadRequestError',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/completions/{id}': {
      put: {
        tags: ['Completions'],
        summary: 'Actualizar notas de completado',
        description: 'Actualiza únicamente las notas de un completado',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateCompletionRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Completado actualizado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HabitCompletion',
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/BadRequestError',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
      delete: {
        tags: ['Completions'],
        summary: 'Eliminar completado',
        description: 'Elimina un registro de completado',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          204: {
            description: 'Completado eliminado',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/completions/{id}/images': {
      post: {
        tags: ['Completions'],
        summary: 'Añadir imagen a completado',
        description: 'Añade una imagen a un registro de completado (máximo 5 imágenes)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
            description: 'ID del completado',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AddImageRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Imagen añadida',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CompletionImage',
                },
              },
            },
          },
          400: {
            description: 'Imagen requerida o límite alcanzado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== IMAGES ====================
    '/images/{id}': {
      delete: {
        tags: ['Images'],
        summary: 'Eliminar imagen',
        description: 'Elimina una imagen de completado',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          204: {
            description: 'Imagen eliminada',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== CHALLENGES ====================
    '/challenges': {
      get: {
        tags: ['Challenges'],
        summary: 'Listar desafíos disponibles',
        description: 'Obtiene todos los desafíos activos disponibles',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de desafíos',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Challenge',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/challenges/available-for-revival': {
      get: {
        tags: ['Challenges'],
        summary: 'Desafíos para revivir',
        description: 'Obtiene desafíos disponibles cuando el usuario tiene 0 vidas',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Lista de desafíos para revivir',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Challenge',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/challenges/{id}/assign': {
      post: {
        tags: ['Challenges'],
        summary: 'Asignar desafío a hábito',
        description: 'Asigna un desafío a un hábito específico del usuario',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
            description: 'ID del desafío',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AssignChallengeRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Desafío asignado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserChallenge',
                },
              },
            },
          },
          400: {
            $ref: '#/components/responses/BadRequestError',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            description: 'Desafío o hábito no encontrado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          409: {
            description: 'Desafío ya asignado a este hábito',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
                example: {
                  message: 'Challenge already assigned to this habit.',
                },
              },
            },
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/challenges/{userChallengeId}/submit-proof': {
      post: {
        tags: ['Challenges'],
        summary: 'Enviar prueba de desafío',
        description: 'Envía una prueba (texto o imagen) para validar el desafío',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userChallengeId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  proofText: {
                    type: 'string',
                    description: 'Texto de prueba',
                  },
                  proofImageUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'URL de imagen de prueba',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Prueba enviada',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessMessage',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/challenges/{userChallengeId}/proof-status': {
      get: {
        tags: ['Challenges'],
        summary: 'Estado de prueba de desafío',
        description: 'Obtiene el estado de validación de la prueba enviada',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userChallengeId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          200: {
            description: 'Estado de la prueba',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['pending', 'approved', 'rejected'],
                    },
                    validatedAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== LIFE CHALLENGES ====================
    '/life-challenges': {
      get: {
        tags: ['Life Challenges'],
        summary: 'Listar life challenges',
        description:
          'Obtiene todos los life challenges disponibles. Usa ?withStatus=true para incluir el estado del usuario.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'withStatus',
            in: 'query',
            schema: {
              type: 'boolean',
            },
            description: 'Si es true, incluye el estado de cada challenge para el usuario',
          },
        ],
        responses: {
          200: {
            description: 'Lista de life challenges',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/LifeChallenge',
                      },
                    },
                    {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/LifeChallengeStatus',
                      },
                    },
                  ],
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/life-challenges/status': {
      get: {
        tags: ['Life Challenges'],
        summary: 'Estado de life challenges',
        description: 'Obtiene el estado de todos los life challenges para el usuario',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Estados de life challenges',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/LifeChallengeStatus',
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/life-challenges/{id}/redeem': {
      post: {
        tags: ['Life Challenges'],
        summary: 'Canjear life challenge',
        description: 'Canjea un life challenge completado por vidas extra',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          200: {
            description: 'Challenge canjeado exitosamente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RedeemResponse',
                },
              },
            },
          },
          400: {
            description: 'No se puede canjear el challenge',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    success: { type: 'boolean', example: false },
                  },
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== LEAGUES ====================
    '/leagues/current': {
      get: {
        tags: ['Leagues'],
        summary: 'Liga actual',
        description: 'Obtiene información de la liga actual del usuario y sus competidores',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Información de la liga',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CurrentLeagueResponse',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            description: 'No hay liga activa',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },

    // ==================== NOTIFICATIONS ====================
    '/notifications/{id}/read': {
      put: {
        tags: ['Notifications'],
        summary: 'Marcar como leída',
        description: 'Marca una notificación como leída',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          200: {
            description: 'Notificación marcada como leída',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessMessage',
                },
              },
            },
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
    '/notifications/{id}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Eliminar notificación',
        description: 'Elimina una notificación',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              format: 'uuid',
            },
          },
        ],
        responses: {
          204: {
            description: 'Notificación eliminada',
          },
          401: {
            $ref: '#/components/responses/UnauthorizedError',
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/ServerError',
          },
        },
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: [], // No usamos anotaciones JSDoc, toda la spec está en swaggerDefinition
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Application): void => {
  // Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'HabitRush API Documentation',
    }),
  );

  // JSON spec endpoint
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

export default swaggerSpec;
