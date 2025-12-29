/**
 * ============================================================================
 * ADMIN MONITORING DASHBOARD
 * Purpose: Real-time monitoring of system health, metrics, and alerts
 * Access: Admin only
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Activity, AlertTriangle, Database, Server, TrendingUp, Clock, AlertCircle } from 'lucide-react-native';
import { SafeView } from '@/components/SafeView';
import { API_BASE_URL } from '@/constants/api';
import { tokenManager } from '@/utils/tokenManager';
import { LinearGradient } from 'expo-linear-gradient';

interface MonitoringData {
  status: string;
  score: number;
  uptime: number;
  requests: {
    total: number;
    errors: number;
    errorRate: string;
  };
  performance: {
    averageResponseTime: string;
    p95ResponseTime: string;
  };
  system: {
    memoryUsage: string;
    databasePoolUsage: string;
  };
}

interface Alert {
  type: string;
  data: any;
  timestamp: number;
  severity: string;
}

export default function MonitoringScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [isRateLimited, setIsRateLimited] = useState(false);
  
  // Rate limiting: Minimum 20 seconds between refreshes
  const REFRESH_COOLDOWN_MS = 20000;

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/(tabs)');
    } else if (user?.role === 'admin') {
      fetchMonitoringData();
    }
  }, [user?.role]);


  const fetchMonitoringData = async () => {
    try {
      setLoading(true);
      const token = await tokenManager.getValidToken();
      if (!token) {
        console.error('No authentication token found');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch status and alerts in parallel
      const [statusResponse, alertsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/monitoring/status`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).catch(error => {
          console.error('Error fetching monitoring status:', error);
          return { ok: false, status: 500, text: () => Promise.resolve('Network error') };
        }),
        fetch(`${API_BASE_URL}/api/monitoring/alerts?limit=10`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).catch(error => {
          console.error('Error fetching alerts:', error);
          return { ok: false, status: 500, json: () => Promise.resolve({ status: 'error', data: { alerts: [] } }) };
        })
      ]);

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        // Validate and set monitoring data with defaults
        if (statusData && statusData.status === 'success' && statusData.data) {
          const data = statusData.data;
          setMonitoringData({
            status: data.status || 'unknown',
            score: data.score ?? 0,
            uptime: data.uptime ?? 0,
            requests: {
              total: data.requests?.total ?? 0,
              errors: data.requests?.errors ?? 0,
              errorRate: data.requests?.errorRate ?? '0.00'
            },
            performance: {
              averageResponseTime: data.performance?.averageResponseTime ?? '0',
              p95ResponseTime: data.performance?.p95ResponseTime ?? '0'
            },
            system: {
              memoryUsage: data.system?.memoryUsage ?? '0.00',
              databasePoolUsage: data.system?.databasePoolUsage ?? '0.00'
            }
          });
        } else {
          console.error('Invalid monitoring data structure:', statusData);
        }
      } else {
        const errorText = await statusResponse.text().catch(() => 'Unknown error');
        console.error('Failed to fetch monitoring status:', statusResponse.status, errorText);
      }

      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        setAlerts(alertsData.data?.alerts || []);
      } else {
        // Alerts are optional, don't log error if it fails
        setAlerts([]);
      }
    } catch (error) {
      console.error('Error fetching monitoring data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    
    if (timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);
      setIsRateLimited(true);
      setTimeout(() => setIsRateLimited(false), REFRESH_COOLDOWN_MS - timeSinceLastRefresh);
      return;
    }

    setLastRefreshTime(now);
    setRefreshing(true);
    fetchMonitoringData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return '#10B981'; // green
      case 'degraded':
        return '#F59E0B'; // yellow
      case 'unhealthy':
        return '#EF4444'; // red
      default:
        return '#6B7280'; // gray
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Activity size={20} color="#10B981" />;
      case 'degraded':
        return <AlertTriangle size={20} color="#F59E0B" />;
      case 'unhealthy':
        return <AlertCircle size={20} color="#EF4444" />;
      default:
        return <Activity size={20} color="#6B7280" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading && !monitoringData) {
    return (
      <SafeView backgroundColor="#F9FAFB">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading monitoring data...</Text>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView backgroundColor="#F9FAFB" excludeBottom={true}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>System Monitoring</Text>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing || isRateLimited}
            style={[styles.refreshButton, (refreshing || isRateLimited) && styles.refreshButtonDisabled]}
          >
            <Activity size={20} color={refreshing || isRateLimited ? "#9CA3AF" : "#3B82F6"} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              enabled={!isRateLimited}
            />
          }
        >
          {monitoringData && (
            <>
              {/* Status Overview */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>System Status</Text>
                  {getStatusIcon(monitoringData.status)}
                </View>
                <LinearGradient
                  colors={[getStatusColor(monitoringData.status) + '20', getStatusColor(monitoringData.status) + '10']}
                  style={styles.statusCard}
                >
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Status:</Text>
                    <Text style={[styles.statusValue, { color: getStatusColor(monitoringData.status) }]}>
                      {monitoringData.status.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Health Score:</Text>
                    <Text style={styles.statusValue}>{monitoringData.score}/100</Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Uptime:</Text>
                    <Text style={styles.statusValue}>{formatUptime(monitoringData.uptime)}</Text>
                  </View>
                </LinearGradient>
              </View>

              {/* Request Metrics */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Server size={20} color="#3B82F6" />
                  <Text style={styles.sectionTitle}>Request Metrics</Text>
                </View>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{monitoringData.requests.total.toLocaleString()}</Text>
                    <Text style={styles.metricLabel}>Total Requests</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                      {monitoringData.requests.errors}
                    </Text>
                    <Text style={styles.metricLabel}>Errors</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricValue, parseFloat(monitoringData.requests.errorRate) > 5 ? { color: '#EF4444' } : {}]}>
                      {monitoringData.requests.errorRate}%
                    </Text>
                    <Text style={styles.metricLabel}>Error Rate</Text>
                  </View>
                </View>
              </View>

              {/* Performance Metrics */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <TrendingUp size={20} color="#3B82F6" />
                  <Text style={styles.sectionTitle}>Performance</Text>
                </View>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCard}>
                    <Clock size={24} color="#3B82F6" />
                    <Text style={styles.metricValue}>{monitoringData.performance.averageResponseTime}ms</Text>
                    <Text style={styles.metricLabel}>Avg Response</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Clock size={24} color="#F59E0B" />
                    <Text style={styles.metricValue}>{monitoringData.performance.p95ResponseTime}ms</Text>
                    <Text style={styles.metricLabel}>P95 Response</Text>
                  </View>
                </View>
              </View>

              {/* System Resources */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Database size={20} color="#3B82F6" />
                  <Text style={styles.sectionTitle}>System Resources</Text>
                </View>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricValue, parseFloat(monitoringData.system.memoryUsage) > 80 ? { color: '#EF4444' } : {}]}>
                      {monitoringData.system.memoryUsage}%
                    </Text>
                    <Text style={styles.metricLabel}>Memory Usage</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={[styles.metricValue, parseFloat(monitoringData.system.databasePoolUsage) > 80 ? { color: '#EF4444' } : {}]}>
                      {monitoringData.system.databasePoolUsage}%
                    </Text>
                    <Text style={styles.metricLabel}>DB Pool Usage</Text>
                  </View>
                </View>
              </View>

              {/* Alerts */}
              {alerts.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <AlertTriangle size={20} color="#EF4444" />
                    <Text style={styles.sectionTitle}>Recent Alerts</Text>
                  </View>
                  {alerts.map((alert, index) => (
                    <View key={index} style={styles.alertCard}>
                      <View style={styles.alertHeader}>
                        <Text style={styles.alertType}>{alert.type}</Text>
                        <Text style={styles.alertSeverity}>{alert.severity}</Text>
                      </View>
                      <Text style={styles.alertData}>{JSON.stringify(alert.data, null, 2)}</Text>
                      <Text style={styles.alertTime}>
                        {new Date(alert.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  refreshButton: {
    padding: 8,
  },
  refreshButtonDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  alertCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    marginBottom: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  alertType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  alertSeverity: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  alertData: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  alertTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
});

