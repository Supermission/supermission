
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe, ShieldCheck, Zap } from 'lucide-react';

interface AgentRecommendationPanelProps {
    messageId: string;
    data: {
        recommendedAgent?: string;
        reason?: string;
        capabilities?: string[];
        confidence?: number;
        agentId?: string;
    };
}

export const AgentRecommendationPanel: React.FC<AgentRecommendationPanelProps> = ({ messageId, data }) => {
    if (!data) return null;

    return (
        <Card className="w-full max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 mt-2">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Agent Recommendation
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">
                        {data.recommendedAgent || 'Unknown Agent'}
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1">
                        {data.reason || 'Based on your request, this agent is best suited to help you.'}
                    </p>
                </div>

                {data.capabilities && data.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {data.capabilities.map((cap, idx) => (
                            <span
                                key={idx}
                                className="px-2 py-1 bg-zinc-800 rounded-md text-xs text-zinc-300 border border-zinc-700"
                            >
                                {cap}
                            </span>
                        ))}
                    </div>
                )}

                <div className="pt-2">
                    <Button
                        variant="outline"
                        className="w-full border-zinc-700 hover:bg-zinc-800 text-zinc-200"
                        onClick={() => {}}
                    >
                        Switch to Agent
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
