import PropTypes from 'prop-types'
import ScenarioDatasetSelector from './ScenarioDatasetSelector'

const ConditionalDatasetSelector = ({
  scenario,
  selectedDataset,
  onDatasetSelect,
  validationError,
  isCollapsed,
  onToggleCollapse
}) => {
  // Use the new ScenarioDatasetSelector that loads datasets from the scenario's datasets property
  return (
    <ScenarioDatasetSelector
      selectedScenario={scenario}
      selectedDataset={selectedDataset}
      onDatasetSelect={onDatasetSelect}
      validationError={validationError}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
    />
  )
}

ConditionalDatasetSelector.propTypes = {
  scenario: PropTypes.string,
  selectedDataset: PropTypes.shape({
    type: PropTypes.string,
    option: PropTypes.string,
    content: PropTypes.string
  }).isRequired,
  onDatasetSelect: PropTypes.func.isRequired,
  validationError: PropTypes.string,
  isCollapsed: PropTypes.bool,
  onToggleCollapse: PropTypes.func
}

ConditionalDatasetSelector.defaultProps = {
  scenario: null,
  validationError: null,
  isCollapsed: false,
  onToggleCollapse: null
}

export default ConditionalDatasetSelector
