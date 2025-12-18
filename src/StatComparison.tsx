import React from 'react';

interface StatComparisonProps {
  data: any; // Replace with a more specific type if known
  homeColor: string;
  awayColor: string;
}

const StatComparison: React.FC<StatComparisonProps> = ({ data, homeColor, awayColor }) => {
  // Placeholder for a stat comparison visualization
  // In a real application, this would render charts or graphs
  return (
    <div className="bg-slate-800 p-4 rounded-lg">
      <h4 className="text-white text-md font-semibold mb-2">Team Statistics</h4>
      <div className="flex justify-between items-center mb-1">
        <span className="text-slate-300">Home Team Strength:</span>
        <span className="font-bold" style={{ color: homeColor }}>{data?.home?.[0] || 'N/A'}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-slate-300">Away Team Strength:</span>
        <span className="font-bold" style={{ color: awayColor }}>{data?.away?.[0] || 'N/A'}</span>
      </div>
      <p className="text-sm text-slate-500 mt-3">
        Detailed statistical comparison would be displayed here.
      </p>
    </div>
  );
};

export default StatComparison;
