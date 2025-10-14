/**
 * Admin Service - Comprehensive admin management for Zone News Bot
 * Handles authentication, permissions, roles, and audit logging
 */

const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const logger = require('../utils/logger');
const WebhookInfo = require('../models/webhook-info');

// Admin Schema
const adminSchema = new Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  firstName: String,
  lastName: String,
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator', 'editor'],
    default: 'editor',
    index: true
  },
  permissions: [{
    type: String,
    enum: [
      'manage_admins',
      'manage_channels',
      'manage_posts',
      'schedule_posts',
      'delete_posts',
      'edit_posts',
      'view_stats',
      'manage_users',
      'manage_settings',
      'broadcast_messages',
      'manage_subscriptions',
      'moderate_content',
      'view_logs',
      'manage_templates',
      'manage_reactions',
      'manage_webhooks',
      'export_data',
      'import_data',
      'manage_database',
      'system_maintenance'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isSuperAdmin: {
    type: Boolean,
    default: false
  },
  lastActive: Date,
  loginHistory: [{
    timestamp: Date,
    ip: String,
    userAgent: String,
    action: String
  }],
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,
  apiKey: String,
  apiKeyExpiry: Date,
  sessionToken: String,
  sessionExpiry: Date,
  failedAttempts: {
    type: Number,
    default: 0
  },
  lockoutUntil: Date,
  metadata: {
    addedBy: String,
    addedAt: Date,
    lastModifiedBy: String,
    lastModifiedAt: Date,
    notes: String
  },
  settings: {
    notifications: {
      newPosts: { type: Boolean, default: true },
      newUsers: { type: Boolean, default: true },
      errorNotifications: { type: Boolean, default: true }, // Renamed from 'errors' to avoid reserved keyword
      systemAlerts: { type: Boolean, default: true }
    },
    theme: {
      type: String,
      default: 'dark'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'Australia/Adelaide'
    }
  }
}, {
  timestamps: true,
  collection: 'admins'
});

// Audit Log Schema
const auditLogSchema = new Schema({
  adminId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  resource: {
    type: String,
    index: true
  },
  resourceId: String,
  details: Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  success: {
    type: Boolean,
    default: true
  },
  error: String,
  duration: Number,
  metadata: Schema.Types.Mixed
}, {
  timestamps: true,
  collection: 'audit_logs'
});

// Session Schema
const sessionSchema = new Schema({
  adminId: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  ip: String,
  userAgent: String,
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: Date,
  metadata: Schema.Types.Mixed
}, {
  timestamps: true,
  collection: 'admin_sessions'
});

// Permission Template Schema
const permissionTemplateSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: String,
  role: {
    type: String,
    required: true
  },
  permissions: [String],
  isDefault: {
    type: Boolean,
    default: false
  },
  createdBy: String,
  metadata: Schema.Types.Mixed
}, {
  timestamps: true,
  collection: 'permission_templates'
});

// Models
const Admin = model('Admin', adminSchema);
const AuditLog = model('AuditLog', auditLogSchema);
const Session = model('Session', sessionSchema);
const PermissionTemplate = model('PermissionTemplate', permissionTemplateSchema);

class AdminService {
  constructor() {
    this.admins = new Map(); // Cache
    this.sessions = new Map(); // Active sessions cache
    this.rolePermissions = {
      super_admin: [
        'manage_admins', 'manage_channels', 'manage_posts', 'schedule_posts',
        'delete_posts', 'edit_posts', 'view_stats', 'manage_users',
        'manage_settings', 'broadcast_messages', 'manage_subscriptions',
        'moderate_content', 'view_logs', 'manage_templates', 'manage_reactions',
        'manage_webhooks', 'export_data', 'import_data', 'manage_database',
        'system_maintenance'
      ],
      admin: [
        'manage_channels', 'manage_posts', 'schedule_posts', 'delete_posts',
        'edit_posts', 'view_stats', 'manage_users', 'broadcast_messages',
        'manage_subscriptions', 'moderate_content', 'view_logs', 'manage_templates',
        'manage_reactions', 'export_data'
      ],
      moderator: [
        'manage_posts', 'delete_posts', 'edit_posts', 'view_stats',
        'moderate_content', 'view_logs', 'manage_reactions'
      ],
      editor: [
        'manage_posts', 'edit_posts', 'view_stats', 'view_logs'
      ]
    };
    this.maxFailedAttempts = 5;
    this.lockoutDuration = 30 * 60 * 1000; // 30 minutes
    this.sessionDuration = 24 * 60 * 60 * 1000; // 24 hours
    this.apiKeyDuration = 90 * 24 * 60 * 60 * 1000; // 90 days
    this.initializeDefaultTemplates();
    this.startSessionCleanup();
  }

  /**
   * Initialize default permission templates
   */
  async initializeDefaultTemplates() {
    try {
      const templates = [
        {
          name: 'Super Admin',
          role: 'super_admin',
          description: 'Full system access',
          permissions: this.rolePermissions.super_admin,
          isDefault: true
        },
        {
          name: 'Admin',
          role: 'admin',
          description: 'Administrative access',
          permissions: this.rolePermissions.admin,
          isDefault: true
        },
        {
          name: 'Moderator',
          role: 'moderator',
          description: 'Content moderation access',
          permissions: this.rolePermissions.moderator,
          isDefault: true
        },
        {
          name: 'Editor',
          role: 'editor',
          description: 'Content editing access',
          permissions: this.rolePermissions.editor,
          isDefault: true
        }
      ];

      for (const template of templates) {
        await PermissionTemplate.findOneAndUpdate(
          { name: template.name },
          template,
          { upsert: true, new: true }
        );
      }
    } catch (error) {
      logger.error('Failed to initialize permission templates:', error);
    }
  }

  /**
   * Start session cleanup interval
   */
  startSessionCleanup() {
    setInterval(async () => {
      try {
        // Clean expired sessions
        await Session.deleteMany({
          expiresAt: { $lt: new Date() }
        });

        // Update cache
        const activeSessions = await Session.find({ isActive: true });
        this.sessions.clear();
        activeSessions.forEach(session => {
          this.sessions.set(session.token, session);
        });
      } catch (error) {
        logger.error('Session cleanup error:', error);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Authenticate admin
   */
  async authenticateAdmin(telegramId, userData = {}) {
    try {
      let admin = await Admin.findOne({ telegramId: String(telegramId) });

      if (!admin) {
        // Check if this should be a super admin (from env)
        const superAdmins = process.env.TELEGRAM_ADMIN_IDS?.split(',') || [];
        if (!superAdmins.includes(String(telegramId))) {
          await this.logAudit(telegramId, 'authentication_failed', 'admin', null, {
            reason: 'not_authorized'
          });
          return { success: false, error: 'Not authorized' };
        }

        // Create super admin
        admin = await this.createAdmin({
          telegramId: String(telegramId),
          username: userData.username || `admin_${telegramId}`,
          firstName: userData.first_name,
          lastName: userData.last_name,
          role: 'super_admin',
          isSuperAdmin: true,
          permissions: this.rolePermissions.super_admin
        });
      }

      // Check if account is active
      if (!admin.isActive) {
        await this.logAudit(telegramId, 'authentication_failed', 'admin', admin._id, {
          reason: 'account_inactive'
        });
        return { success: false, error: 'Account inactive' };
      }

      // Check lockout
      if (admin.lockoutUntil && admin.lockoutUntil > new Date()) {
        await this.logAudit(telegramId, 'authentication_failed', 'admin', admin._id, {
          reason: 'account_locked'
        });
        return { success: false, error: 'Account locked' };
      }

      // Create session
      const session = await this.createSession(admin);

      // Update last active
      admin.lastActive = new Date();
      admin.loginHistory.push({
        timestamp: new Date(),
        action: 'login',
        ip: userData.ip,
        userAgent: userData.userAgent
      });

      // Keep only last 100 login history entries
      if (admin.loginHistory.length > 100) {
        admin.loginHistory = admin.loginHistory.slice(-100);
      }

      admin.failedAttempts = 0;
      admin.lockoutUntil = null;
      await admin.save();

      // Update cache
      this.admins.set(telegramId, admin);

      await this.logAudit(telegramId, 'authentication_success', 'admin', admin._id);

      return {
        success: true,
        admin: this.sanitizeAdmin(admin),
        session
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      await this.logAudit(telegramId, 'authentication_error', 'admin', null, {
        error: error.message
      });
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Create admin
   */
  async createAdmin(adminData) {
    try {
      const admin = new Admin({
        ...adminData,
        metadata: {
          addedBy: adminData.addedBy || 'system',
          addedAt: new Date()
        }
      });

      await admin.save();
      this.admins.set(admin.telegramId, admin);

      await this.logAudit(
        adminData.addedBy || 'system',
        'admin_created',
        'admin',
        admin._id,
        { role: admin.role }
      );

      return admin;
    } catch (error) {
      logger.error('Failed to create admin:', error);
      throw error;
    }
  }

  /**
   * Update admin
   */
  async updateAdmin(telegramId, updates, updatedBy) {
    try {
      const admin = await Admin.findOne({ telegramId: String(telegramId) });
      if (!admin) {
        throw new Error('Admin not found');
      }

      // Don't allow self-demotion from super admin
      if (admin.isSuperAdmin && updates.role && updates.role !== 'super_admin') {
        throw new Error('Cannot demote super admin');
      }

      Object.assign(admin, updates);
      admin.metadata.lastModifiedBy = updatedBy;
      admin.metadata.lastModifiedAt = new Date();

      await admin.save();
      this.admins.set(telegramId, admin);

      await this.logAudit(
        updatedBy,
        'admin_updated',
        'admin',
        admin._id,
        { updates }
      );

      return admin;
    } catch (error) {
      logger.error('Failed to update admin:', error);
      throw error;
    }
  }

  /**
   * Delete admin
   */
  async deleteAdmin(telegramId, deletedBy) {
    try {
      const admin = await Admin.findOne({ telegramId: String(telegramId) });
      if (!admin) {
        throw new Error('Admin not found');
      }

      // Don't allow deletion of super admin
      if (admin.isSuperAdmin) {
        throw new Error('Cannot delete super admin');
      }

      await admin.deleteOne();
      this.admins.delete(telegramId);

      // Invalidate all sessions
      await Session.deleteMany({ adminId: telegramId });

      await this.logAudit(
        deletedBy,
        'admin_deleted',
        'admin',
        admin._id,
        { username: admin.username, role: admin.role }
      );

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete admin:', error);
      throw error;
    }
  }

  /**
   * Check permission
   */
  async checkPermission(telegramId, permission) {
    try {
      const admin = await this.getAdmin(telegramId);
      if (!admin || !admin.isActive) {
        return false;
      }

      // Super admin has all permissions
      if (admin.isSuperAdmin) {
        return true;
      }

      // Check specific permissions
      if (admin.permissions.includes(permission)) {
        return true;
      }

      // Check role-based permissions
      const rolePerms = this.rolePermissions[admin.role] || [];
      return rolePerms.includes(permission);
    } catch (error) {
      logger.error('Permission check error:', error);
      return false;
    }
  }

  /**
   * Get admin
   */
  async getAdmin(telegramId) {
    try {
      // Check cache first
      if (this.admins.has(telegramId)) {
        return this.admins.get(telegramId);
      }

      const admin = await Admin.findOne({ telegramId: String(telegramId) });
      if (admin) {
        this.admins.set(telegramId, admin);
      }

      return admin;
    } catch (error) {
      logger.error('Failed to get admin:', error);
      return null;
    }
  }

  /**
   * Get all admins
   */
  async getAllAdmins(filters = {}) {
    try {
      const query = {};
      
      if (filters.role) {
        query.role = filters.role;
      }
      
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }

      const admins = await Admin.find(query).sort({ createdAt: -1 });
      return admins.map(admin => this.sanitizeAdmin(admin));
    } catch (error) {
      logger.error('Failed to get admins:', error);
      return [];
    }
  }

  /**
   * Create session
   */
  async createSession(admin) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + this.sessionDuration);

      const session = new Session({
        adminId: admin.telegramId,
        token,
        expiresAt,
        lastActivity: new Date()
      });

      await session.save();
      this.sessions.set(token, session);

      return {
        token,
        expiresAt,
        admin: this.sanitizeAdmin(admin)
      };
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Validate session
   */
  async validateSession(token) {
    try {
      let session = this.sessions.get(token);
      
      if (!session) {
        session = await Session.findOne({ token, isActive: true });
        if (!session) {
          return { valid: false };
        }
      }

      if (session.expiresAt < new Date()) {
        await this.invalidateSession(token);
        return { valid: false };
      }

      // Update last activity
      session.lastActivity = new Date();
      await session.save();

      const admin = await this.getAdmin(session.adminId);
      if (!admin || !admin.isActive) {
        await this.invalidateSession(token);
        return { valid: false };
      }

      return {
        valid: true,
        admin: this.sanitizeAdmin(admin)
      };
    } catch (error) {
      logger.error('Session validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(token) {
    try {
      await Session.findOneAndUpdate(
        { token },
        { isActive: false },
        { new: true }
      );
      this.sessions.delete(token);
      return { success: true };
    } catch (error) {
      logger.error('Failed to invalidate session:', error);
      return { success: false };
    }
  }

  /**
   * Generate API key
   */
  async generateApiKey(telegramId) {
    try {
      const admin = await this.getAdmin(telegramId);
      if (!admin) {
        throw new Error('Admin not found');
      }

      const apiKey = crypto.randomBytes(32).toString('hex');
      const apiKeyExpiry = new Date(Date.now() + this.apiKeyDuration);

      admin.apiKey = await bcrypt.hash(apiKey, 10);
      admin.apiKeyExpiry = apiKeyExpiry;
      await admin.save();

      await this.logAudit(
        telegramId,
        'api_key_generated',
        'admin',
        admin._id
      );

      return {
        apiKey,
        expiresAt: apiKeyExpiry
      };
    } catch (error) {
      logger.error('Failed to generate API key:', error);
      throw error;
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey) {
    try {
      const admins = await Admin.find({
        apiKeyExpiry: { $gt: new Date() }
      });

      for (const admin of admins) {
        if (admin.apiKey && await bcrypt.compare(apiKey, admin.apiKey)) {
          return {
            valid: true,
            admin: this.sanitizeAdmin(admin)
          };
        }
      }

      return { valid: false };
    } catch (error) {
      logger.error('API key validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Log audit
   */
  async logAudit(adminId, action, resource, resourceId, details = {}) {
    try {
      const auditLog = new AuditLog({
        adminId: String(adminId),
        action,
        resource,
        resourceId,
        details,
        success: !details.error
      });

      await auditLog.save();
      return auditLog;
    } catch (error) {
      logger.error('Failed to log audit:', error);
    }
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(filters = {}, limit = 100) {
    try {
      const query = {};
      
      if (filters.adminId) {
        query.adminId = filters.adminId;
      }
      
      if (filters.action) {
        query.action = filters.action;
      }
      
      if (filters.resource) {
        query.resource = filters.resource;
      }
      
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          query.createdAt.$lte = new Date(filters.endDate);
        }
      }

      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);

      return logs;
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      return [];
    }
  }

  /**
   * Get admin statistics
   */
  async getAdminStats() {
    try {
      const [
        totalAdmins,
        activeAdmins,
        activeSessions,
        recentLogs
      ] = await Promise.all([
        Admin.countDocuments(),
        Admin.countDocuments({ isActive: true }),
        Session.countDocuments({ isActive: true, expiresAt: { $gt: new Date() } }),
        AuditLog.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      const adminsByRole = await Admin.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      const recentActions = await AuditLog.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      return {
        totalAdmins,
        activeAdmins,
        activeSessions,
        recentLogs,
        adminsByRole: adminsByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentActions: recentActions.map(item => ({
          action: item._id,
          count: item.count
        }))
      };
    } catch (error) {
      logger.error('Failed to get admin stats:', error);
      return {};
    }
  }

  /**
   * Sanitize admin data for response
   */
  sanitizeAdmin(admin) {
    if (!admin) return null;

    return {
      id: admin._id,
      telegramId: admin.telegramId,
      username: admin.username,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      permissions: admin.permissions,
      isActive: admin.isActive,
      isSuperAdmin: admin.isSuperAdmin,
      lastActive: admin.lastActive,
      settings: admin.settings,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt
    };
  }

  /**
   * Handle failed login attempt
   */
  async handleFailedLogin(telegramId) {
    try {
      const admin = await Admin.findOne({ telegramId: String(telegramId) });
      if (!admin) return;

      admin.failedAttempts = (admin.failedAttempts || 0) + 1;

      if (admin.failedAttempts >= this.maxFailedAttempts) {
        admin.lockoutUntil = new Date(Date.now() + this.lockoutDuration);
        await this.logAudit(
          telegramId,
          'account_locked',
          'admin',
          admin._id,
          { attempts: admin.failedAttempts }
        );
      }

      await admin.save();
    } catch (error) {
      logger.error('Failed to handle failed login:', error);
    }
  }

  /**
   * Get webhook status information
   * @param {string} adminId - Admin ID making the request
   * @returns {Object} Webhook status data
   */
  async getWebhookStatus(adminId) {
    try {
      // Check permission
      const hasPermission = await this.checkPermission(adminId, 'view_stats');
      if (!hasPermission) {
        throw new Error('Insufficient permissions to view webhook status');
      }

      // Get latest webhook info
      const webhookInfo = await WebhookInfo.findOne()
        .sort({ lastChecked: -1 })
        .lean();

      if (!webhookInfo) {
        return {
          status: 'unknown',
          message: 'No webhook information available',
          data: null
        };
      }

      // Log audit
      await this.logAudit(adminId, 'VIEW_WEBHOOK_STATUS', 'webhook', webhookInfo._id);

      return {
        status: webhookInfo.healthScore >= 80 ? 'healthy' : 
                webhookInfo.healthScore >= 50 ? 'degraded' : 'unhealthy',
        healthScore: webhookInfo.healthScore || 0,
        data: webhookInfo
      };
    } catch (error) {
      logger.error('Failed to get webhook status:', error);
      throw error;
    }
  }

  /**
   * Get webhook analytics data
   * @param {string} adminId - Admin ID making the request
   * @param {Object} options - Query options
   * @returns {Object} Analytics data
   */
  async getWebhookAnalytics(adminId, options = {}) {
    try {
      // Check permission
      const hasPermission = await this.checkPermission(adminId, 'view_stats');
      if (!hasPermission) {
        throw new Error('Insufficient permissions to view webhook analytics');
      }

      const {
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate = new Date(),
        limit = 100
      } = options;

      // Get webhook analytics data
      const webhookData = await WebhookInfo.find({
        lastChecked: {
          $gte: startDate,
          $lte: endDate
        }
      })
        .sort({ lastChecked: -1 })
        .limit(limit)
        .lean();

      // Calculate aggregate metrics
      const totalUpdates = webhookData.reduce((sum, w) => sum + (w.metrics?.totalUpdates || 0), 0);
      const successfulUpdates = webhookData.reduce((sum, w) => sum + (w.metrics?.successfulUpdates || 0), 0);
      const failedUpdates = webhookData.reduce((sum, w) => sum + (w.metrics?.failedUpdates || 0), 0);
      const avgProcessingTime = webhookData.length > 0 ?
        webhookData.reduce((sum, w) => sum + (w.metrics?.averageProcessingTime || 0), 0) / webhookData.length : 0;
      const avgHealthScore = webhookData.length > 0 ?
        webhookData.reduce((sum, w) => sum + (w.healthScore || 0), 0) / webhookData.length : 0;

      // Log audit
      await this.logAudit(adminId, 'VIEW_WEBHOOK_ANALYTICS', 'webhook', null, {
        startDate,
        endDate,
        recordCount: webhookData.length
      });

      return {
        period: {
          start: startDate,
          end: endDate
        },
        metrics: {
          totalUpdates,
          successfulUpdates,
          failedUpdates,
          successRate: totalUpdates > 0 ? (successfulUpdates / totalUpdates * 100).toFixed(2) : 0,
          averageProcessingTime: avgProcessingTime.toFixed(2),
          averageHealthScore: avgHealthScore.toFixed(2)
        },
        timeline: webhookData.map(w => ({
          timestamp: w.lastChecked,
          healthScore: w.healthScore,
          pendingUpdates: w.pendingUpdateCount,
          successRate: w.metrics?.successfulUpdates && w.metrics?.totalUpdates ?
            (w.metrics.successfulUpdates / w.metrics.totalUpdates * 100).toFixed(2) : 0
        })),
        currentStatus: webhookData[0] || null
      };
    } catch (error) {
      logger.error('Failed to get webhook analytics:', error);
      throw error;
    }
  }

  /**
   * Get all webhook statuses for admin dashboard
   * @param {string} adminId - Admin ID making the request
   * @returns {Array} List of webhook statuses
   */
  async getAllWebhookStatuses(adminId) {
    try {
      // Check permission
      const hasPermission = await this.checkPermission(adminId, 'view_stats');
      if (!hasPermission) {
        throw new Error('Insufficient permissions to view webhook statuses');
      }

      // Get all webhook statuses
      const statuses = await WebhookInfo.find()
        .sort({ lastChecked: -1 })
        .lean();

      // Log audit
      await this.logAudit(adminId, 'VIEW_ALL_WEBHOOK_STATUSES', 'webhook', null, {
        count: statuses.length
      });

      return statuses.map(status => ({
        id: status._id,
        url: status.url,
        health: status.healthScore >= 80 ? 'healthy' : 
                status.healthScore >= 50 ? 'degraded' : 'unhealthy',
        healthScore: status.healthScore,
        pendingUpdates: status.pendingUpdateCount,
        lastError: status.lastErrorMessage,
        lastErrorDate: status.lastErrorDate,
        lastChecked: status.lastChecked,
        metrics: {
          total: status.metrics?.totalUpdates || 0,
          successful: status.metrics?.successfulUpdates || 0,
          failed: status.metrics?.failedUpdates || 0,
          successRate: status.metrics?.successfulUpdates && status.metrics?.totalUpdates ?
            (status.metrics.successfulUpdates / status.metrics.totalUpdates * 100).toFixed(2) : 0
        }
      }));
    } catch (error) {
      logger.error('Failed to get all webhook statuses:', error);
      throw error;
    }
  }

  /**
   * Get unhealthy webhooks requiring attention
   * @param {string} adminId - Admin ID making the request
   * @returns {Array} List of unhealthy webhooks
   */
  async getUnhealthyWebhooks(adminId) {
    try {
      // Check permission
      const hasPermission = await this.checkPermission(adminId, 'view_stats');
      if (!hasPermission) {
        throw new Error('Insufficient permissions to view unhealthy webhooks');
      }

      // Get unhealthy webhooks
      const unhealthyWebhooks = await WebhookInfo.find({ 
        healthScore: { $lt: 50 } 
      })
        .sort({ healthScore: 1 })
        .lean();

      // Log audit
      await this.logAudit(adminId, 'VIEW_UNHEALTHY_WEBHOOKS', 'webhook', null, {
        count: unhealthyWebhooks.length
      });

      return unhealthyWebhooks.map(webhook => ({
        id: webhook._id,
        url: webhook.url,
        healthScore: webhook.healthScore,
        status: 'unhealthy',
        issues: [
          webhook.lastErrorMessage && `Last Error: ${webhook.lastErrorMessage}`,
          webhook.pendingUpdateCount > 100 && `High pending updates: ${webhook.pendingUpdateCount}`,
          webhook.metrics?.failedUpdates > webhook.metrics?.successfulUpdates && 'High failure rate',
          webhook.metrics?.averageProcessingTime > 5000 && 'Slow processing time'
        ].filter(Boolean),
        recommendation: webhook.healthScore < 20 ?
          'Critical: Consider restarting webhook' :
          'Warning: Monitor closely',
        lastChecked: webhook.lastChecked,
        metrics: webhook.metrics
      }));
    } catch (error) {
      logger.error('Failed to get unhealthy webhooks:', error);
      throw error;
    }
  }

  /**
   * Cleanup old data
   */
  async cleanup(daysToKeep = 90) {
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

      const results = await Promise.all([
        AuditLog.deleteMany({ createdAt: { $lt: cutoffDate } }),
        Session.deleteMany({ createdAt: { $lt: cutoffDate }, isActive: false })
      ]);

      logger.info(`Cleaned up ${results[0].deletedCount} audit logs and ${results[1].deletedCount} sessions`);
      
      return {
        auditLogs: results[0].deletedCount,
        sessions: results[1].deletedCount
      };
    } catch (error) {
      logger.error('Cleanup error:', error);
      throw error;
    }
  }
}

// Export class for instantiation in bot-initialization
module.exports = AdminService;
